import math

def sq(x):
    return x * x;

def magnitude(p):
    return math.sqrt(sq(p[0]) + sq(p[1]))

def covar(xs, ys):
    if len(xs) != len(ys):
        return {"error": "lengths of vectors passed to covar() must match!"}

    # Compute the means.
    n = len(xs)
    xm = sum(xs) / n
    ym = sum(ys) / n

    # Compute the covariance.
    return sum([(xi - xm) * (yi - ym) for xi, yi in zip(xs, ys)]) / n

def mattrans(m):
    def plucker(i):
        return lambda row: row[i]

    t = []
    for i in xrange(len(m[0])):
        t.append(map(plucker(i), m))

    return t

def quadraticRoots(a, b, c):
    determinant = math.sqrt(sq(b) - 4*a*c)
    return [(-b + determinant) / (2*a), (-b - determinant) / (2*a)]

def normalize(v):
    mag = magnitude(v)
    return [v[0] / mag, v[1] / mag]

def eigen2x2(m):
    # Calculate the eigenvalues using the quadratic formula.
    eigenval = quadraticRoots(1, -(m[0][0] + m[1][1]), m[0][0] * m[1][1] - m[1][0] * m[0][1])

    # Calculate the eigenvectors based on the eigenvalues.
    eigenvec = map(normalize, [[m[0][1], m[0][0] - eigenval[0]],
                               [m[0][1], m[0][0] - eigenval[1]]])

    return {"vals": eigenval,
            "vecs": eigenvec}

def covarMat(data):
    trans = mattrans(data)
    M = len(trans)

    covars = []
    for i in xrange(M):
        covars.append([])
        for j in xrange(M):
            if j < i:
                cov = covars[j][i]
            else:
                cov = covar(trans[i], trans[j])

            covars[i].append(cov)

    return covars

def geomean(data):
    summed = reduce(lambda x, y: [x[0] + y[0], x[1] + y[1]], data)
    return [summed[0] / len(data), summed[1] / len(data)]

def stddev(data):
    mean = sum(data) / len(data)
    return math.sqrt(sum([sq(d - mean) for d in data]) / (len(data) - 1))

def data_ellipse(center, eigensystem):
    eigval = eigensystem["vals"]
    eigvec = eigensystem["vecs"]

    angle = math.atan2(eigvec[0][1], eigvec[0][0]) / (2 * math.pi) * 360

    return {"cx": center[0],
            "cy": center[1],
            "rx": math.sqrt(eigval[0]),
            "ry": math.sqrt(eigval[1]),
            "angle": angle}

def sum_distances(x, pts):
    return sum([magnitude([x[0] - p[0], x[1] - p[1]]) for p in pts])
