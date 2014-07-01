/*jslint browser: true, nomen: true */
/*globals tangelo, d3, Backbone, _ */

var app = {};
app.models = {};
app.collections = {};
app.views = {};

app.models.JobPosting = Backbone.Model.extend({
    save: function () {
        "use strict";

        throw new Error("app.models.JobPosting is a read-only model");
    },

    destroy: function () {
        "use strict";

        throw new Error("app.models.JobPosting is a read-only model");
    }
});

app.collections.PostingSet = Backbone.Collection.extend({
    model: app.models.JobPosting,

    initialize: function () {
        "use strict";

        this.on("reset", function () {
            console.log("reset");
        });
    },

    url: "search/mongo/xdata/employment",

    fetch: _.wrap(Backbone.Collection.prototype.fetch, function (fetch, options) {
        "use strict";

        var limit,
            params;

        params = {
            date: options.date || "null",
            history: options.history || 0,
            country: options.country || "null",
            query: options.query || "null",
            limit: options.limit || 1000
        };

        limit = +d3.select("#limit")
            .property("value");
        limit = limit || 0;

        if (limit > 0) {
            params.limit = limit;
        } else {
            d3.select("#limit")
                .property("value", "");
        }

        options = options || {};
        _.bind(fetch, this)({
            success: options.success,
            data: params
        });
    }),

    parse: function (response) {
        "use strict";

        return response.results;
    },

    partition: function (pfunc) {
        "use strict";

        return this;
    }
});

app.views.MapShot = Backbone.View.extend({
    initialize: function (options) {
        "use strict";

        this.g = d3.select(this.$el.geojsMap("svg"))
            .append("g")
            .attr("id", _.uniqueId("mapshot"));

        this.color = options.color || "black";
        this.opacity = options.opacity || 1.0;
        this.renderDots = options.renderDots === undefined ? true : options.renderDots;
    },

    computeDataEllipse: function () {
        "use strict";

        var data,
            center,
            median,
            medianDev,
            geoloc,
            ellipse,
            eigen;

        data = this.collection.models;

        if (data.length === 0) {
            return;
        }

        // Extract latlongs to compute data circle.
        geoloc = data.map(function (d) {
            return d.get("geolocation");
        }).filter(function (d) {
            return d[0] !== 0 || d[1] !== 0;
        });

        if (geoloc.length === 0) {
            return;
        }

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
        "use strict";

        var ellipse;

        if (this.renderDots) {
            this.g.selectAll("circle")
                .data(this.collection.models)
                .enter()
                .append("circle")
                .style("fill", this.color)
                .style("opacity", this.opacity)
                .each(function (d) {
                    Backbone.$(this).popover({
                        html: true,
                        container: "body",
                        trigger: "hover",
                        content: "<pre>" + JSON.stringify(d.attributes, null, 4) + "</pre>",
                        delay: {
                            show: 100,
                            hide: 100
                        }
                    });
                });
        }

        ellipse = this.computeDataEllipse();
        if (ellipse) {
            this.g.append("ellipse")
                .datum(ellipse)
                .classed("ellipse", true)
                .style("stroke", this.color)
                .style("stroke-opacity", this.opacity)
                .style("fill", this.color)
                .style("fill-opacity", 0.1 * this.opacity)
                .style("pointer-events", "none");
        }
    }
});

app.views.MasterView = Backbone.View.extend({
    initialize: function (options) {
        "use strict";

        var sliceFunction = function (slice) {
            var comp;

            if (slice === "None") {
                return tangelo.accessor({value: 0});
            }

            comp = slice.split(" ");
            if (comp.length === 1) {
                comp[1] = comp[0];
                comp[0] = "Single";
            }

            if (comp[0] === "Single") {
                comp[0] = 1;
            } else if(comp[0] === "Double") {
                comp[0] = 2;
            } else if(comp[0] === "Triple") {
                comp[0] = 3;
            } else if(comp[0] === "Quadruple") {
                comp[0] = 4;
            } else {
                throw "fatal error: comp[0] was '" + comp[0] + "'";
            }

            if (comp[1] === "Days") {
                comp[1] = 1;
            } else if (comp[1] === "Weeks") {
                comp[1] = 7;
            } else if (comp[1] === "Months") {
                comp[1] = 30;
            } else if (comp[1] === "Years") {
                comp[1] = 365;
            } else {
                throw "fatal error: comp[1] was '" + comp[1] + "'";
            }

            return function (datestr) {
                var datecomp = datestr.split("-"),
                    year = +datecomp[0],
                    month = +datecomp[1] - 1,
                    day = +datecomp[2];

                seconds = new Date(year, month, day).getTime() / 1000;

                return seconds / comp[0] / comp[1];
            };
        };

        this.$el.geojsMap();
        this.svg = d3.select(this.$el.geojsMap("svg"));

        this.jobs = new app.collections.PostingSet();

        this.colors = d3.scale.category10();

        $.each(this.sliceFuncs, _.bind(function (k) {
            this.sliceFuncs[k] = sliceFunction(k);
        }, this));

        Backbone.on("country:change", this.updateCountries, this);
        Backbone.on("date:change", this.updateDate, this);
        Backbone.on("group:change", this.updateGroup, this);
        Backbone.on("slice:change", this.updateSlice, this);
        Backbone.on("sample:change", this.updateSample, this);
        this.jobs.on("sync", function (postings) {
            d3.select("#count")
                .text(postings.length);
        });

        this.$el.on("draw", _.bind(this.draw, this));
    },

    latlng2display: function (lat, lng) {
        "use strict";

        return this.$el.geojsMap("latlng2display", geo.latlng(lat, lng));
    },

    updateCountries: function (countries) {
        "use strict";

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
        "use strict";

        // Bail if the new date is equal to the old.
        if (this.date === date) {
            return;
        }

        // Save the new date and initiate a render action.
        this.date = date;
        this.render();
    },

    updateGroup: function (group) {
        "use strict";

        if (this.group === group) {
            return;
        }

        this.group = group;
        this.render();
    },

    updateSlice: function (slice) {
        "use strict";

        if (this.slice === slice) {
            return;
        }

        this.slice = slice;
        this.render();
    },

    updateSample: function (sample) {
        console.log(sample);
    },

    draw: function () {
        "use strict";

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
        "use strict";

        this.jobs.fetch({
            date: this.date,
            country: JSON.stringify(this.countries),
            success: _.bind(function (me) {
                var groups,
                    renderDots;

                // Empty the SVG element.
                this.svg.selectAll("*")
                    .remove();

                // Decide whether to render the dots.
                renderDots = this.jobs.length <= 800;

                // Group the collection of JobPostings by the grouping function.
                groups = this.jobs.groupBy(tangelo.accessor(this.groupFuncs[this.group]));

                // Create MapShot views to handle the search results, one per
                // group.
                this.subviews = _.map(groups, _.bind(function (group) {
                    return new app.views.MapShot({
                        collection: new app.collections.PostingSet(group),
                        el: this.el,
                        color: this.colors(tangelo.accessor(this.groupFuncs[this.group])(group[0])),
                        opacity: 1.0,
                        renderDots: renderDots
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
    slice: "None",

    groupFuncs: {
        "None": {value: 0},
        "Country": {field: "attributes.country_code"},
        "Job type": {field: "attributes.type"}
    },

    sliceFuncs: {
        "None": null,
        "Days": null,
        "Double Days": null,
        "Triple Days": null,
        "Quadruple Days": null,
        "Weeks": null,
        "Double Weeks": null,
        "Triple Weeks": null,
        "Quadruple Weeks": null,
        "Months": null,
        "Double Months": null,
        "Triple Months": null,
        "Quadruple Months": null,
        "Years": null,
        "Double Years": null,
        "Triple Years": null,
        "Quadruple Years": null
    }
});

Backbone.$(function () {
    "use strict";

    var getSamplingParameters = function () {
        return {
            range: d3.select("#history").property("value"),
            unit: d3.select("#period").property("value")
        };
    };

    // Create control panel.
    Backbone.$("#control-panel").controlPanel();

    // Create a date picker.
    (function () {
        var olddate = null;

        Backbone.$("#date").datepicker({
            changeYear: true,
            changeMonth: true,
            defaultDate: new Date(2012, 9, 24),
            onSelect: function () {
                var datestring = Backbone.$(this).val(),
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

    d3.select("#slicing")
        .on("change", function () {
            Backbone.trigger("slice:change", d3.select(this).property("value"));
        });

    // Handle the history menus.
    d3.select("#history")
        .on("change", function () {
            Backbone.trigger("sample:change", getSamplingParameters());
        });

    d3.select("#period")
        .on("change", function () {
            Backbone.trigger("sample:change", getSamplingParameters());
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

    // Populate the "slice by" menu.
    d3.select("#slicing")
        .selectAll("option")
        .data(_.keys(app.masterview.sliceFuncs))
        .enter()
        .append("option")
        .text(function (d) {
            return d;
        });

    // Populate the history menus.
    d3.select("#history")
        .selectAll("option")
        .data([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
        .enter()
        .append("option")
        .text(function (d) {
            return d;
        });
});
