import analysis as A
from bson.json_util import loads, dumps
import calendar
import datetime
import functools
import itertools
import math
import pymongo
import tangelo

def compact_dumps(o):
    return dumps(o, separators=(",", ":"))
    #return dumps(o, indent=4)

def group_by(items, key):
    result = {}
    for i in items:
        k = key(i)
        if k not in result:
            result[k] = []
        result[k].append(i)
    return result

def compute_data_ellipse(locs):
    # Throw away "null" data - points with lat and long of 0 are not likely to
    # be real job posting locations.
    locs = filter(lambda p: p[0] != 0 or p[1] != 0, locs)

    # Bail out if there is no data.
    #
    # TODO: if there is only one data point, we should maybe compute a default,
    # small circle and bail out with that.
    if len(locs) <= 1 or A.stddev(map(lambda x: x[0], locs)) < 1e-5 or A.stddev(map(lambda x: x[1], locs)) < 1e-5:
        return None

    center = A.geomean(locs)

    #median = A.gradient_descent(functools.partial(A.dist_grad, locs), center, 0, 1000, 1e-8)
    median = A.gradient_descent_iter(functools.partial(A.dist_grad, locs), center, 0, 1000, 1e-8)
    median_dev = A.mad(locs, median["result"])

    eigen = A.eigen2x2(A.covarMat(locs))

    return A.data_ellipse(center, eigen)

@tangelo.return_type(compact_dumps)
@tangelo.types(history=int, country=loads, limit=int, query=loads, sample=int, ellipse=loads)
def run(host, db, coll, date=None, history=0, country=None, groupBy=None, sliceBy=None, limit=100, query=None, sample=None, ellipse=False):
    # First establish a connection.
    try:
        c = pymongo.mongo_client.MongoClient(host=host)[db][coll]
    except (ConnectionFailure, AutoReconnect) as e:
        return {"error": repr(e)}

    # This will be a list of sub-queries that will all be and-ed together to
    # form the final query.
    terms = []

    # If there is a date provided, place it as a term.
    if date is not None:
        # Parse the date into a datetime object.
        try:
            enddate = datetime.datetime.strptime(date, "%Y-%m-%d")
        except ValueError as e:
            return {"error": repr(e)}

        # Go back in history from this date by the number of days given in the
        # "history" parameter.
        startdate = enddate - datetime.timedelta(history)

        #terms.append({"posted": enddate})
        terms.append({"$and": [{"posted": {"$lte": enddate}},
                               {"posted": {"$gte": startdate}}]})

    # If there is a list of country codes, add them as terms.
    if country is not None and len(country) > 0:
        clauses = [{"country_code": code} for code in country]
        terms.append({"$or": clauses})

    # If there are other query parameters, just include them wholesale.
    if query is not None:
        try:
            query = loads(query)
        except ValueError as e:
            return {"error": repr(e)}

        terms.append(query)

    # Tie all the terms together with an "and".
    search = {"$and": terms}

    # Build a fields dict (to exclude the _id field).
    fields = {"_id": False,
              "posted": True,
              "geolocation": True}
    if groupBy is not None:
        fields[groupBy] = True

    # Perform the search.
    it = c.find(spec=search, limit=limit, fields=fields)

    # Group the records by the grouping criterion.
    if groupBy is None:
        grouper = lambda x: 0
    else:
        grouper = lambda x: x[groupBy]
    groups = group_by(it, grouper)

    # Group the groups by the time slicing criterion.
    #
    # First develop the correct parameters from the name.
    if sliceBy is None:
        slicer = lambda x: 0
    else:
        parts = sliceBy.split(" ")
        if len(parts) == 1:
            parts.append(parts[0])
            parts[0] = "Single"

        # Compute the multiplier from the first word in the slicer name.
        multiplicity = {"Single": 1,
                        "Double": 2,
                        "Triple": 3,
                        "Quadruple": 4}
        multiplier = multiplicity.get(parts[0])
        if multiplier is None:
            return None

        # Compute the unit value (in days) from the second word.
        units = {"Days": 1,
                 "Weeks": 7,
                 "Months": 30}
        unit = units.get(parts[1])
        if unit is None:
            return None

        # Create a function that gives the number of slices (of time) since the
        # epoch for a given record's posting date.
        slicer = lambda x: int(calendar.timegm(x["posted"].timetuple()) / 86400 / multiplier / unit)

    # Group each group by this time slicing function.
    for group in groups:
        groups[group] = group_by(groups[group], slicer)

    # Compress the grouping by consolidating the geolocation data into lists.
    for groupname, group in groups.iteritems():
        for slicename, slice in group.iteritems():
            geoloc = map(lambda x: x["geolocation"], slice)
            groups[groupname][slicename] = {"geoloc": geoloc,
                                            "ellipse": compute_data_ellipse(geoloc)}

    return groups

@tangelo.return_type(dumps)
@tangelo.types(history=int, query=loads, country=loads, limit=int)
def run2(host, db, coll, date=None, history=0, country=None, limit=100, query=None, fields=None, sample=None):
    # First establish a connection.
    try:
        c = pymongo.mongo_client.MongoClient(host=host)[db][coll]
    except (ConnectionFailure, AutoReconnect) as e:
        return {"error": repr(e)}

    # This will be a list of sub-queries that will all be and-ed together to
    # form the final query.
    terms = []

    # If there is a date provided, place it as a term.
    if date is not None:
        # Parse the date into a datetime object.
        try:
            enddate = datetime.datetime.strptime(date, "%Y-%m-%d")
        except ValueError as e:
            return {"error": repr(e)}

        # Go back in history from this date by the number of days given in the
        # "history" parameter.
        startdate = enddate - datetime.timedelta(history)

        #terms.append({"posted": enddate})
        terms.append({"$and": [{"posted": {"$lte": enddate}},
                               {"posted": {"$gte": startdate}}]})

    # If there is a list of country codes, add them as terms.
    if country is not None and len(country) > 0:
        clauses = [{"country_code": code} for code in country]
        terms.append({"$or": clauses})

    # If there are other query parameters, just include them wholesale.
    if query is not None:
        try:
            query = loads(query)
        except ValueError as e:
            return {"error": repr(e)}

        terms.append(query)

    # Tie all the terms together with an "and".
    search = {"$and": terms}

    try:
        fields = loads(fields)
    except (ValueError, TypeError):
        pass

    # Perform the search.
    it = c.find(spec=search, limit=limit, fields=fields)

    # Run the iterator to return the results.
    if sample is None:
        result = list(it)
    else:
        # We want to uniformly sample the results so as to return at most
        # `sample` results.
        it2 = it.clone()
        skip = int(math.ceil(it2.count() / sample))
        result = list(islice(it2, 0, None, sample))

    # Compute a data ellipse if requested.
    response = {"results": results}
    if ellipse:
        response["ellipse"] = computeDataEllipse(it)

    return response
