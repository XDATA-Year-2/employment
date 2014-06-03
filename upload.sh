#!/bin/sh

python="$PYTHON"
if [ -z "$python" ]; then
    python="python"
fi

host=$1
db=$2
coll=$3
shift 3

for filename in "$@"; do
    $python to-mongo-array.py $filename | iconv -f latin1 -t utf-8 | mongoimport -h $host -d $db -c $coll
done
