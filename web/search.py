import analysis as A
from bson.json_util import loads, dumps
import calendar
import datetime
import functools
import itertools
import math
import pymongo
import random
import scipy.optimize
import tangelo

def compact_dumps(o):
    return dumps(o, separators=(",", ":"))

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
#    median = A.gradient_descent_iter(functools.partial(A.dist_grad, locs), center, 0, 1000, 1e-8)
    #median_dev = A.mad(locs, median["result"])

    # Run a scipy optimizer to compute the median and median absolute deviation.
    opt = scipy.optimize.fmin(A.sum_distances, x0=center, args=(locs,), full_output=True)
    median = list(opt[0])
    median_dev = opt[1]

    eigen = A.eigen2x2(A.covarMat(locs))

    ellipse = A.data_ellipse(center, eigen)
    return ellipse

def decimate(groups, fraction, randomize=False):
    if not randomize:
        random.seed(0)

    for group in groups:
        for slice in groups[group]:
            data = groups[group][slice]["geoloc"]
            if len(data) > 5:
                groups[group][slice]["geoloc"] = random.sample(data, max(1, int(fraction * len(data))))

@tangelo.return_type(compact_dumps)
@tangelo.types(history=int, country=loads, limit=int, query=loads, sample=int, ellipse=loads)
def run(host, db, coll, date=None, history=0, country=None, groupBy="", sliceBy=None, limit=100, query=None, sample=0, ellipse=False):
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
    if groupBy != "":
        fields[groupBy] = True

    # Perform the search.
    it = c.find(spec=search, limit=limit, fields=fields)

    # Group the records by the grouping criterion.
    if groupBy == "":
        grouper = lambda x: 0
    else:
        grouper = lambda x: x[groupBy]
    groups = group_by(it, grouper)

    # Group the groups by the time slicing criterion.
    #
    # First develop the correct parameters from the name.
    if sliceBy == "":
        slicer = lambda x: 0
    else:
        # Create a function that gives the number of slices (of time) since the
        # epoch for a given record's posting date.
        slicer = lambda x: int(calendar.timegm(x["posted"].timetuple()) / 86400 / int(sliceBy))

    # Group each group by this time slicing function.
    for group in groups:
        groups[group] = group_by(groups[group], slicer)

    # Compress the grouping by consolidating the geolocation data into lists.
    for groupname, group in groups.iteritems():
        for slicename, slice in group.iteritems():
            geoloc = map(lambda x: x["geolocation"], slice)
            groups[groupname][slicename] = {"geoloc": geoloc,
                                            "ellipse": compute_data_ellipse(geoloc)}

    nrecs = it.count(with_limit_and_skip=True)
    if sample != 0 and sample < nrecs:
        decimate(groups, float(sample) / nrecs)

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
