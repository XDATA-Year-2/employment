/*jslint browser: true */

/*globals $, tangelo, d3 */

var app = {};
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
    initialize: function (options) {
        this.g = d3.select(this.$el.geojsMap("svg"))
            .append("g")
            .attr("id", _.uniqueId("mapshot"));

        this.color = options.color || "black";
    },

    computeDataEllipse: function () {
        var data,
            center,
            median,
            medianDev,
            geoloc,
            ellipse,
            eigen;

        data = this.g.selectAll("circle")
            .data();

        if (data.length === 0) {
            return;
        }

        // Extract latlongs to compute data circle.
        geoloc = data.map(function (d) {
            return d.get("geolocation");
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
        return dataEllipse(center, eigen);
    },

    render: function () {
        this.g.selectAll("circle")
            .data(this.collection.models)
            .enter()
            .append("circle")
            .style("fill", this.color);

        this.g.append("ellipse")
            .datum(this.computeDataEllipse())
            .classed("ellipse", true)
            .style("stroke", this.color)
            .style("fill", this.color)
            .style("fill-opacity", 0.1);
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
        Backbone.on("group:change", this.updateGroup, this);

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

    updateGroup: function (group) {
        if (this.group === group) {
            return;
        }

        this.group = group;
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
            .style("stroke", "black");

        this.svg.selectAll(".ellipse")
            .each(function (d) {
                d.pixellipse = mapTransform(d, that.$el);
            })
            .attr("cx", function (d) {
                return d.pixellipse.cx;
            })
            .attr("cy", function (d) {
                return d.pixellipse.cy;
            })
            .attr("rx", function (d) {
                return d.pixellipse.rx;
            })
            .attr("ry", function (d) {
                return d.pixellipse.ry;
            })
            .attr("transform", function (d) {
                return "rotate(" + d.pixellipse.angle + " " + d.pixellipse.cx + " " + d.pixellipse.cy + ")";
            });
    },

    render: function () {
        this.jobs.fetch({
            date: this.date,
            country: JSON.stringify(this.countries),
            success: _.bind(function (me) {
                var groups;

                // Empty the SVG element.
                this.svg.selectAll("*")
                    .remove();

                // Group the collection of JobPostings by the grouping function.
                groups = this.jobs.groupBy(tangelo.accessor(this.groupFuncs[this.group]));

                // Create MapShot views to handle the search results, one per
                // group.
                this.subviews = _.map(groups, _.bind(function (group) {
                    return new app.views.MapShot({
                        collection: new app.collections.PostingSet(group),
                        el: this.el,
                        color: this.colors(tangelo.accessor(this.groupFuncs[this.group])(group[0]))
                    });
                }, this));

                // Have them populate the SVG element with dots and data
                // ellipse.
                _.each(this.subviews, function (view) {
                    view.render();
                });

                // Draw immediately to refresh the screen (further drawing will
                // occur on pan and zoom events).
                this.draw();
            }, this)
        });
    },

    countries: [],
    date: "",
    group: "None",

    groupFuncs: {
        "None": {value: 0},
        "Country": {field: "attributes.country_code"},
        "Job type": {field: "attributes.type"}
    }
});

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
        .on("keyup", _.debounce(function () {
            var countries = d3.select(this)
                    .property("value")
                    .split(",")
                    .map(function (s) {
                        return s.trim();
                    })
                    .filter(function (s) {
                        return s.length > 0;
                    });

            Backbone.trigger("country:change", countries);
        }, 500));

    // Handle the grouping menu.
    d3.select("#grouping")
        .on("change", function () {
            Backbone.trigger("group:change", d3.select(this).property("value"));
        });

    app.masterview = new app.views.MasterView({
        el: "#map"
    });

    // Populate the "group by" menu.
    d3.select("#grouping")
        .selectAll("option")
        .data(_.keys(app.masterview.groupFuncs))
        .enter()
        .append("option")
        .text(function (d) {
            return d;
        });
});
