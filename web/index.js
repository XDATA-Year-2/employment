/*jslint browser: true */

/*globals $, tangelo, d3 */

$(function () {
    "use strict";

    // Create control panel.
    //$("#control-panel").controlPanel();

    // Retrieve some data, then use it to populate a map.
    d3.json("/service/mongo/mongo/xdata/employment?limit=100", function (error, data) {
        if (error) {
            console.error(error);
            return;
        }

        // Extract the geolocation fields for the sake of the tangelo accessors
        // below.
        data.result.data.forEach(function (v) {
            v.longitude = v.geolocation[0];
            v.latitude = v.geolocation[1];

            delete v.geolocation;
        });

        // Initialize a map.
        $("#map").geojsdots({
            data: data.result.data,
            latitude: {field: "latitude"},
            longitude: {field: "longitude"},
            size: {value: 6},
            color: {field: "type"}
        });
    });
});
