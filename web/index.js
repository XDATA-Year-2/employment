/*jslint browser: true */

/*globals $, tangelo, d3 */

var app = {};
app.countries = [];
app.limit = 1000;

function draw(data) {
        var data,
            center,
            median,
            medianDev,
            geoloc,
            ellipse,
            ellipseElem,
            pixellipse,
            eigen;

        if (data.length === 0) {
            return;
        }

        // Extract latlongs to compute data circle.
        geoloc = data.map(function (d) {
            return d.geolocation;
        }).filter(function (d) {
            return d[0] !== 0 || d[1] !== 0;
        });

        // Eliminate the outliers.
        //geoloc = removeOutliers(geoloc);

        // Geolocated mean.
        center = geomean(geoloc);

        // Test out the gradient descent thing.
        median = gradientDescent(distGrad.bind(null, geoloc), center, 0, 1000, 1e-8);
        medianDev = mad(geoloc, median.result);

        // Eigensystem.
        eigen = eigen2x2(covarMat(geoloc));

        // Compute a data ellipse.
        ellipse = dataEllipse(center, eigen);

/*        ellipse = {*/
            //cx: median.result[0],
            //cy: median.result[1],
            //rx: medianDev[0],
            //ry: medianDev[1],
            //angle: ellipse.angle
        //};

        // Initialize a map.
        $("#map").geojsdots({
            data: data,
            latitude: {field: "geolocation.1"},
            longitude: {field: "geolocation.0"},
            size: {value: 6},
            color: {field: "country_code"}
        });

        ellipseElem = d3.select($("#map").geojsdots("svg"))
            .append("ellipse")
            .classed("ellipse", true);

        $("#map").on("draw", function () {
            // Transform the data ellipse attributes, which are in units of
            // lat/long, to pixel values.
            pixellipse = mapTransform(ellipse, $("#map"));

            //d3.select(".ellipse")
            ellipseElem
                .attr("cx", pixellipse.cx)
                .attr("cy", pixellipse.cy)
                .attr("rx", pixellipse.rx)
                .attr("ry", pixellipse.ry)
                .attr("transform", "rotate(" + pixellipse.angle + " " + pixellipse.cx + " " + pixellipse.cy + ")")
                .style("stroke", "black")
                .style("fill", "none");
        });
}

function drawCallback(error, response) {
    var plural = function (n) {
        return n === 1 ? "" : "s";
    },
        count;

    if (error) {
        console.error(error);
        return;
    }

    console.log(response.results);

    count = response.results.length;
    d3.select("#count")
        .text(count + " result" + plural(count));

    draw(response.results);
}

function doQuery(date, countries, limit){
    var qstring;

    if (!date) {
        return;
    }

    qstring = "search/mongo/xdata/employment?limit=" + limit + "&date=" + date + "&country=[" + countries + "]";
    d3.json(qstring, drawCallback);
}

$(function () {
    "use strict";

    // Create control panel.
    $("#control-panel").controlPanel();

    // Create a date picker.
    (function () {
        var olddate = null;

        $("#date").datepicker({
            changeYear: true,
            changeMonth: true,
            defaultDate: new Date(2012, 9, 24),
            onSelect: function () {
                var datestring = $(this).val(),
                    comp,
                    date;

                if (datestring !== olddate) {
                    olddate = datestring;

                    // Convert the American-style date to a canonical form
                    // ("YY-MM-DD").
                    comp = datestring.split("/");
                    datestring = [comp[2], comp[0], comp[1]].join("-");

                    app.date = datestring;

                    doQuery(app.date, app.countries, app.limit);
                }
            }
        });
    }());

    // Handle the country codes box.
    d3.select("#codes")
        .on("keyup", (function () {
            var timeout = null,
                oldtext = null;

            return function () {
                var box = d3.select(this),
                    text = box.property("value");

                if (timeout) {
                    window.clearTimeout(timeout);
                }

                if (text === oldtext) {
                    return;
                }

                timeout = window.setTimeout(function () {
                    oldtext = text;

                    app.countries = text.split(",")
                        .map(function (s) {
                            return s.trim();
                        })
                        .filter(function (s) {
                            return s.length > 0;
                        })
                        .map(function (s) {
                            return '"' + s + '"';
                        });

                    doQuery(app.date, app.countries, app.limit);
                    timeout = null;
                }, 500);
            };
        }()));
});
