employment
==========

Employment Dataset

Preparing the Data
------------------

``to-mongo-array.py`` reads in a TSV employment data file and converts it to the
"JSON array" form used by MongoDB (this is not a true JSON array, but rather a
newline-separated list of JSON objects).  The script converts the geolocation
fields to floats and aggregates them into a ``[long, lat]`` list (suitable for
geoindexing in MongoDB), and also converts the date fields to BSON date objects.

    to-mongo-array.py employment.tsv >employment.json

The text in this file is not UTF-8 encoded, so we need to convert it:

    iconv -f latin1 -t utf-8 employment.json >employment.utf8.json

Finally, we can upload this file to Mongo using ``mongoimport``:

    mongoimport -h mongohost -d mydatabase -c employment --drop --file employment.utf8.json

(The ``--drop`` option causes any existing ``employment`` collection to be
dropped before the upload, so be careful.)
