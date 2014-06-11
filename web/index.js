/*jslint browser: true */

/*globals $, tangelo, d3 */

var app = {};
app.map = null;
app.countries = [];
app.limit = 1000;

app.models = {};
app.collections = {};
app.views = {};

app.models.JobPosting = Backbone.Model.extend({
    save: function () {
        throw new Error("app.models.JobPosting is a read-only model");
    },

    destroy: function () {
        throw new Error("app.models.JobPosting is a read-only model");
    }
});

app.collections.PostingSet = Backbone.Collection.extend({
    model: app.models.JobPosting,

    initialize: function () {
        this.on("reset", function () {
            console.log("reset");
        });
    },

    url: "search/mongo/xdata/employment",

    fetch: _.wrap(Backbone.Collection.prototype.fetch, function (fetch, options) {
        options = options || {};
        _.bind(fetch, this)({
            success: options.success,
            data: {
                date: options.date || "null",
                country: options.country || "null",
                query: options.query || "null",
                limit: options.limit || 1000
            }
        });

    }),

    parse: function (response) {
        return response.results;
    },

    partition: function (pfunc) {
        return this;
    }
});

app.views.MapShot = Backbone.View.extend({
    initialize: function () {
        this.collection.on("reset", this.render, this);
    },

    render: function () {

    }
});

app.views.MasterView = Backbone.View.extend({
    initialize: function (options) {
        this.$el.geojsMap();
        this.svg = d3.select(this.$el.geojsMap("svg"));

        this.jobs = new app.collections.PostingSet();

        this.colors = d3.scale.category10();

        Backbone.on("country:change", this.updateCountries, this);
        Backbone.on("date:change", this.updateDate, this);

        this.$el.on("draw", _.bind(this.draw, this));
    },

    latlng2display: function (lat, lng) {
        return this.$el.geojsMap("latlng2display", geo.latlng(lat, lng));
    },

    updateCountries: function (countries) {
        var i;

        // Check to see if the new country data is equal to the old - if so,
        // bail.
        if (countries.length === this.countries.length) {
            for (i = 0; i < countries.length; i += 1) {
                if (countries[i] !== this.countries[i]) {
                    break;
                }
            }

            if (i === countries.length) {
                return;
            }
        }

        // Save the new data (make a copy!), and initiate a render action.
        this.countries = countries.slice();

        if (this.date) {
            this.render();
        }
    },

    updateDate: function (date) {
        // Bail if the new date is equal to the old.
        if (this.date === date) {
            return;
        }

        // Save the new date and initiate a render action.
        this.date = date;
        this.render();
    },

    draw: function () {
        var that = this;

        this.svg.selectAll("circle")
            .attr("cx", function (d) {
                var pt = that.latlng2display(d.get("geolocation")[1], d.get("geolocation")[0]);
                return pt[0].x;
            })
            .attr("cy", function (d) {
                var pt = that.latlng2display(d.get("geolocation")[1], d.get("geolocation")[0]);
                return pt[0].y;
            })
            .attr("r", 6)
            .style("fill", function (d) {
                return that.colors(d.get("country_code"));
            })
            .style("stroke", "black");
    },

    render: function () {
        this.jobs.fetch({
            date: this.date,
            country: this.country,
            success: _.bind(function (me) {
                this.svg.selectAll("circle")
                    .data(me.models)
                    .enter()
                    .append("circle");

                this.draw();

            }, this)
        });
    },

    countries: "",
    date: ""
});

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

        // Geolocated mean.
        center = geomean(geoloc);

        // Test out the gradient descent thing.
        median = gradientDescent(distGrad.bind(null, geoloc), center, 0, 1000, 1e-8);
        medianDev = mad(geoloc, median.result);

        // Eigensystem.
        eigen = eigen2x2(covarMat(geoloc));

        // Compute a data ellipse.
        ellipse = dataEllipse(center, eigen);

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
                    // ("YYYY-MM-DD").
                    comp = datestring.split("/");
                    datestring = [comp[2], comp[0], comp[1]].join("-");

                    app.date = datestring;

                    Backbone.trigger("date:change", datestring);
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
                    var countries;

                    oldtext = text;

                    countries = text.split(",")
                        .map(function (s) {
                            return s.trim();
                        })
                        .filter(function (s) {
                            return s.length > 0;
                        })
                        .map(function (s) {
                            return '"' + s + '"';
                        });

                    //doQuery(app.date, app.countries, app.limit);
                    Backbone.trigger("country:change", text);
                    timeout = null;
                }, 500);
            };
        }()));

    app.masterview = new app.views.MasterView({
        el: "#map"
    });
});
