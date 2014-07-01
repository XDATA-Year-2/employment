from bson.json_util import loads, dumps
import datetime
import pymongo
import tangelo


@tangelo.return_type(dumps)
@tangelo.types(history=int, query=loads, country=loads, limit=int)
def run(host, db, coll, date=None, history=0, country=None, query=None, limit=100):
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

    # Perform the search.
    it = c.find(spec=search, limit=limit)

    # Run the iterator to return the results.
    return {"results": list(it)}
