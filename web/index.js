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

        // Initialize a map.
        $("#map").geojsdots({
            data: data.result.data,
            latitude: {field: "geolocation.1"},
            longitude: {field: "geolocation.0"},
            size: {value: 6},
            color: {field: "type"}
        });
    });
});
