from rdflib import Graph


g = Graph()
g.parse("../data/smartgrid.owl")
print(len(g), "triplets chargés")

q = """
SELECT ?s ?type WHERE {
  ?s a ?type .
} LIMIT 10
"""
for row in g.query(q):
    print(row)
