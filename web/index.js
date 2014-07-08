/*jslint browser: true, nomen: true */
/*globals tangelo, d3, Backbone, _ */

var app = {};
app.views = {};

app.views.MapShot = Backbone.View.extend({
    initialize: function (options) {
        "use strict";

        this.g = d3.select(this.$el.geojsMap("svg"))
            .append("g")
            .attr("id", _.uniqueId("mapshot"));

        this.color = options.color || "black";
        this.opacity = options.opacity || 1.0;
        this.renderDots = options.renderDots === undefined ? true : options.renderDots;

        this.group = options.group;

        this.geoloc = options.geoloc;
        this.ellipse = options.ellipse;

        console.log(this);
    },

    render: function () {
        "use strict";

        var that = this;

        if (this.renderDots) {
            this.g.selectAll("circle")
                .data(this.geoloc)
                .enter()
                .append("circle")
                .style("fill", this.color)
                .style("opacity", this.opacity)
                .each(function () {
                    if (that.group !== "0") {
                        Backbone.$(this).popover({
                            html: true,
                            container: "body",
                            trigger: "hover",
                            content: "<pre>" + that.group + "</pre>",
                            delay: {
                                show: 100,
                                hide: 100
                            }
                        });
                    }
                });
        }

        if (this.ellipse) {
            this.g.append("ellipse")
                .datum(this.ellipse)
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

        this.$el.geojsMap();
        this.svg = d3.select(this.$el.geojsMap("svg"));

        this.colors = d3.scale.category10();

        Backbone.on("country:change", this.updateCountries, this);
        Backbone.on("date:change", this.updateDate, this);
        Backbone.on("group:change", this.updateGroup, this);
        Backbone.on("slice:change", this.updateSlice, this);
        Backbone.on("sample:change", this.updateSample, this);

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
        var history,
            table = {
                "days" : 1,
                "weeks": 7,
                "months": 30
            };

        history = +sample.range * table[sample.unit];

        if (this.history !== history) {
            this.history = history;
            this.render();
        }
    },

    draw: function () {
        "use strict";

        var that = this;

        this.svg.selectAll("circle")
            .attr("cx", function (d) {
                //var pt = that.latlng2display(d.get("geolocation")[1], d.get("geolocation")[0]);
                var pt = that.latlng2display(d[1], d[0]);
                return pt[0].x;
            })
            .attr("cy", function (d) {
                var pt = that.latlng2display(d[1], d[0]);
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

        console.log("starting render");

        if (this.date !== "") {
            console.log("ajaxing");
            Backbone.$.ajax({
                url: "search/mongo/xdata/employment",
                data: {
                    date: this.date,
                    country: JSON.stringify(this.countries),
                    history: this.history,
                    groupBy: this.groupFuncs[this.group],
                    sliceBy: this.sliceFuncs[this.slice],
                    limit: 1000,
                    sample: 500
                },
                method: "GET",
                dataType: "json",
                success: _.bind(function (groups) {
                    var keys;

                    console.log(groups);

                    this.subviews = _.flatten(_.map(groups, _.bind(function (group, name) {
                        keys = _.keys(group).sort();

                        return _.map(keys, _.bind(function (key, i) {
                            return new app.views.MapShot({
                                geoloc: group[key].geoloc,
                                ellipse: group[key].ellipse,
                                el: this.el,
                                group: name,
                                color: this.colors(name),
                                opacity: (i + 1) / keys.length,
                                renderDots: true
                            });
                        }, this))
                    }, this)));

                    _.each(this.subviews, function (view) {
                        view.render();
                    });

                }, this)
            });
        }
    },

    countries: [],
    date: "",
    group: "None",
    slice: "None",
    history: 0,

    groupFuncs: {
        "None": null,
        "Country": "country_code",
        "Job type": "type"
    },

    sliceFuncs: {
        "None": null,
        "Days": 1,
        "Double Days": 2,
        "Triple Days": 3,
        "Quadruple Days": 4,
        "Weeks": 7,
        "Double Weeks": 14,
        "Triple Weeks": 21,
        "Quadruple Weeks": 28,
        "Months": 30,
        "Double Months": 60,
        "Triple Months": 90,
        "Quadruple Months": 120,
        "Years": 365,
        "Double Years": 2 * 365,
        "Triple Years": 3 * 365,
        "Quadruple Years": 4 * 365
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
