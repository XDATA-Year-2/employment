function sq(x) {
    "use strict";

    return x * x;
}

function magnitude(p) {
    "use strict";

    return Math.sqrt(sq(p[0]) + sq(p[1]));
}

function sum(as) {
    "use strict";

    var i,
        s = 0.0;

    for (i = 0; i < as.length; i += 1) {
        s += as[i];
    }

    return s;
}

function covar(xs, ys) {
    "use strict";

    var xm,
        ym,
        N,
        covariance,
        i;

    if (xs.length !== ys.length) {
        console.error("lengths of vectors passed to covar() must match!");
        return;
    }

    // Get the length of the vectors.
    N = xs.length;

    // Compute the sample means.
    xm = sum(xs) / N;
    ym = sum(ys) / N;

    // Compute the covariance.
    covariance = 0.0;
    for (i = 0; i < N; i += 1) {
        covariance += (xs[i] - xm) * (ys[i] - ym);
    }
    covariance /= N;

    return covariance;
}

function mattrans(m) {
    "use strict";

    var t,
        i,
        plucker;

    plucker = function (i) {
        return function (row) {
            return row[i];
        };
    };

    t = [];
    for (i = 0; i < m[0].length; i += 1) {
/*        t.push(m.map(function (row) {*/
            //return row[i];
        /*}));*/
        t.push(m.map(plucker(i)));
    }

    return t;
}

function quadraticRoots(a, b, c) {
    "use strict";

    var determinant = Math.sqrt(b * b - 4 * a * c);

    return [(-b + determinant) / (2 * a), (-b - determinant) / (2 * a)];
}

function eigen2x2(m) {
    "use strict";

    var eigenval,
        eigenvec;

    // Calculate the eigenvalues using the quadratic formula.
    eigenval = quadraticRoots(1, -(m[0][0] + m[1][1]), m[0][0] * m[1][1] - m[1][0] * m[0][1]);

    // Calculate the eigenvectors based on the eigenvalues.
    eigenvec = [ [m[0][1], m[0][0] - eigenval[0]],
                 [m[0][1], m[0][0] - eigenval[1]] ];

    eigenvec = eigenvec.map(function (v) {
        var mag = Math.sqrt(v[0] * v[0] + v[1] * v[1]);

        return [v[0] / mag, v[1] / mag];
    });

    return {
        vals: eigenval,
        vecs: eigenvec
    };
}

function covarMat(data) {
    "use strict";

    var M,
        trans,
        covars = [],
        cov,
        i,
        j;

    // Compute the transpose of the input matrix, to allow for easier access to
    // the columns.
    trans = mattrans(data);
    M = trans.length;

    // Compute the covariances of the columns with each other.
    for (i = 0; i < M; i += 1) {
        covars.push([]);
        for (j = 0; j < M; j += 1) {
            if (j < i) {
                cov = covars[j][i];
            } else {
                cov = covar(trans[i], trans[j]);
            }

            covars[i].push(cov);
        }
    }

    return covars;
}

function geomean(data) {
    "use strict";

    var sum = [0.0, 0.0];

    data.forEach(function (v) {
        sum[0] += v[0];
        sum[1] += v[1];
    });

    sum[0] /= data.length;
    sum[1] /= data.length;

    return sum;
}

function stddev(data) {
    "use strict";

    var mean,
        variance,
        i;

    // Compute the mean.
    mean = 0.0;
    for (i = 0; i < data.length; i += 1) {
        mean += data[i];
    }
    mean /= data.length;

    // Compute the variance.
    variance = 0.0;
    for (i = 0; i < data.length; i += 1) {
        variance += (data[i] - mean) * (data[i] - mean);
    }

    return variance / (data.length - 1);
}

function dataEllipse(center, eigensystem) {
    "use strict";

    var eigval = eigensystem.vals,
        eigvec = eigensystem.vecs,
        angle;

    // Compute the angle of the first eigenvector from the x-axis.
    angle = Math.atan2(eigvec[0][1], eigvec[0][0]) / (2 * Math.PI) * 360;

    // Send back the attributes needed to draw an SVG data ellipse.
    return {
        cx: center[0],
        cy: center[1],
        rx: Math.sqrt(eigval[0]),
        ry: Math.sqrt(eigval[1]),
        angle: angle
    };
}

function mapTransform(ellipse, map) {
    "use strict";

    var center,
        radii = {},
        display2latlng,
        dlong,
        dlat;

    // Create a shorthand for the lat-long to display function.
    display2latlng = map.geojsdots.bind(map, "display2latlng");

    // Compute the pixel center of the ellipse.
    center = map.geojsdots("latlng2display", geo.latlng(ellipse.cy, ellipse.cx))[0];

    // To figure out the pixel radii of the ellipse, we need to know what the
    // "pixel density" in the lat and long directions are at the center of the
    // ellipse.  We use the inverse mapping to figure out what it is.
    dlong = display2latlng({x: center.x + 1, y: center.y})[0].x - display2latlng({x: center.x, y: center.y})[0].x;
    dlat = display2latlng({x: center.x, y: center.y - 1})[0].y - display2latlng({x: center.x, y: center.y})[0].y;

    // Convert the latlong radii into pixel radii.
    radii = {
        x: ellipse.rx / dlong,
        y: ellipse.ry / dlat
    };

    // Return the transformed ellipse.
    return {
        cx: center.x,
        cy: center.y,
        rx: radii.x,
        ry: radii.y,
        angle: ellipse.angle
    };
}

function removeOutliers(data) {
    "use strict";

    var mean,
        limit,
        dist,
        filtered;

    mean = geomean(data);

    dist = data.map(function (d) {
        var shift = [d[0] - mean[0], d[1] - mean[1]];
        return Math.sqrt(shift[0] * shift[0] + shift[1] * shift[1]);
    });

    //limit = stddev(dist) * 1.5;
    limit = stddev(dist);

    filtered = data.filter(function (d) {
        var shift = [d[0] - mean[0], d[1] - mean[1]],
            dist = Math.sqrt(shift[0] * shift[0] + shift[1] * shift[1]);

        return dist < limit;
    });

    return filtered;
}

function distGrad(pts, pt) {
    "use strict";

    var gradx = 0,
        grady = 0,
        dist,
        x,
        y,
        xi,
        yi,
        i;

    for (i = 0; i < pts.length; i += 1) {
        x = pt[0];
        y = pt[1];

        xi = pts[i][0];
        yi = pts[i][1];

        dist = Math.sqrt(sq(x - xi) + sq(y - yi));

        gradx += (x - xi) / dist;
        grady += (y - yi) / dist;
    }

    return [gradx, grady];
}

function gradientDescent(grad, initial, step, maxsteps, eps) {
    "use strict";

    var gradvec = grad(initial),
        gradval = Math.sqrt(sq(gradvec[0]) + sq(gradvec[1])),
        stepsize = 0.1,
        newinitial;

    if (gradval <= eps || step === maxsteps) {
        return {
            result: initial,
            steps: step,
            grad: gradvec,
            gradMag: gradval
        };
    }

    newinitial = [initial[0] - stepsize * gradvec[0],
                  initial[1] - stepsize * gradvec[1]];

    if (Math.abs(magnitude(grad(newinitial)) - gradval) < eps) {
        stepsize /= 2;
        newinitial = [initial[0] - stepsize * gradvec[0],
                      initial[1] - stepsize * gradvec[1]];
    }

    return gradientDescent(grad, newinitial, step + 1, maxsteps, eps);
}

function numericComp(x, y) {
    return x - y;
}

// "Median absolute deviation".
function mad(pts, median) {
    "use strict";

    var mads = [null, null],
        devs;

    devs = pts.map(function (p) {
        return Math.abs(p[0] - median[0]);
    }).sort(numericComp);

    if (devs.length % 2 === 1) {
        mads[0] = devs[Math.floor(devs.length / 2)];
    } else {
        mads[0] = 0.5 * (devs[devs.length / 2 - 1] + devs[devs.length / 2]);
    }

    devs = pts.map(function (p) {
        return Math.abs(p[1] - median[1]);
    }).sort(numericComp);

    if (devs.length % 2 === 1) {
        mads[1] = devs[Math.floor(devs.length / 2)];
    } else {
        mads[1] = 0.5 * (devs[devs.length / 2 - 1] + devs[devs.length / 2]);
    }

    return mads;
}


