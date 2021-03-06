import bson.json_util
import csv
import datetime
import os.path
import sys

def maybe_float(val, default):
    try:
        return float(val)
    except ValueError:
        return default

def convert_date(s):
    return datetime.datetime.strptime(s, "%Y-%m-%d")

def main():
    if len(sys.argv) < 2:
        print >>sys.stderr, "usage: to-mongo-array.py <employment.tsv>"
        return 1

    filename = sys.argv[1]

    data = csv.reader(open(filename), delimiter="\t")

    headers = ["posted",
               "location",
               "department",
               "title",
               "salary",
               "start",
               "duration",
               "type",
               "applications",
               "company",
               "contact",
               "phone",
               "fax",
               "translated_location",
               "latitude",
               "longitude",
               "first_seen",
               "url",
               "last_seen"]

    # Analyze the filename for a country code.
    try:
        country_code = os.path.basename(filename).split("-")[1]
        if len(country_code) != 2:
            print >>sys.stderr, "weird country code: %s" % (country_code)
            country_code = None
    except IndexError:
        print >>sys.stderr, "couldn't find a country code"
        country_code = None

    for rec in data:
        rec = rec[:4] + rec[5:]
        rec = {h: d for (h, d) in zip(headers, rec)}

        lon = maybe_float(rec["longitude"], 0.0)
        lat = maybe_float(rec["latitude"], 0.0)

        rec["geolocation"] = [lon, lat]
        del rec["longitude"]
        del rec["latitude"]

        for field in ["posted", "first_seen", "last_seen"]:
            rec[field] = convert_date(rec[field])

        rec["country_code"] = country_code

        print bson.json_util.dumps(rec, ensure_ascii=False)

if __name__ == "__main__":
    sys.exit(main())
