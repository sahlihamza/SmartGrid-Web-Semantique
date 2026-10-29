"""Back-end Smart Grid : Flask + rdflib."""
import os
import re
import threading
import traceback
import csv
import io

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from rdflib import Graph, Literal, OWL, RDF, RDFS, URIRef, XSD

import nlp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.abspath(os.path.join(BASE_DIR, "..", "data", "smartgrid.owl"))
FORMAT = "turtle" if DATA_FILE.endswith(".ttl") else "xml"

# Verrou d'accès au graphe : le serveur de développement de Flask traite chaque
# requête dans un thread distinct, et rdflib n'est pas thread-safe (le graphe
# est modifié par les routes d'écriture pendant que les routes de lecture
# l'interrogent). Le verrou sérialise les accès lecture/écriture.
GRAPH_LOCK = threading.RLock()


def load_graph():
    graph = Graph()
    graph.parse(DATA_FILE, format=FORMAT)
    return graph


g = load_graph()


def detect_namespace():
    for subject in g.subjects(RDF.type, OWL.Ontology):
        value = str(subject)
        return value if value.endswith(("#", "/")) else value + "#"
    return None


NS = detect_namespace() or "http://www.semanticweb.org/smartgrid#"
g.bind("sg", NS)
g.bind("owl", OWL)
g.bind("rdfs", RDFS)
g.bind("xsd", XSD)


def sparql_query(sparql):
    """Exécute une requête SPARQL sous verrou.

    Le verrou est indispensable : pyparsing résout l'arité de ses actions de
    parsing au tout premier parse (sonde par try/except TypeError) et mémorise
    le résultat dans l'objet d'analyse. Si deux requêtes sont analysées en
    parallèle, cette sonde peut être corrompue : le parseur appelle alors
    l'action sans argument et *toutes* les requêtes échouent ensuite avec
    « missing 1 required positional argument ». Le préchauffage ci-dessous
    résout l'arité hors thread de requête, le verrou empêche toute concurrence.
    """
    with GRAPH_LOCK:
        return g.query(sparql)


def warmup():
    """Préchauffe le parseur SPARQL au démarrage (hors thread de requête)."""
    try:
        list(sparql_query("SELECT ?s WHERE { ?s ?p ?o } LIMIT 1"))
    except Exception as exc:  # pragma: no cover - le préchauffage est best-effort
        print(f"Préchauffage du parseur SPARQL impossible : {exc}")


warmup()

app = Flask(__name__)
CORS(app)
NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def local(term):
    return str(term).rsplit("#", 1)[-1].rsplit("/", 1)[-1]


def iri(name):
    return f"<{NS}{name}>"


def valid(name):
    return isinstance(name, str) and NAME_RE.fullmatch(name) is not None


# Types de données XSD correspondant aux plages (rdfs:range) déclarées dans
# l'ontologie. L'écriture des instances s'appuie sur ces déclarations : une
# capacité est donc stockée en xsd:float (et non xsd:double) et une date en
# xsd:dateTime, conformément aux axiomes domain/range de l'ontologie.
RANGE_DATATYPES = {
    "float": XSD.float,
    "double": XSD.double,
    "integer": XSD.integer,
    "int": XSD.integer,
    "long": XSD.integer,
    "string": XSD.string,
    "boolean": XSD.boolean,
    "dateTime": XSD.dateTime,
    "date": XSD.date,
}


def range_datatype(property_name):
    """Datatype XSD déclaré par le rdfs:range de la propriété (None si absent).

    Attention : `iri()` renvoie une chaîne entre chevrons (pour SPARQL), il faut
    un URIRef pour interroger le graphe.
    """
    for declared in g.objects(URIRef(f"{NS}{property_name}"), RDFS.range):
        datatype = RANGE_DATATYPES.get(local(declared))
        if datatype is not None:
            return datatype
    return None


def to_term(value, property_name=None):
    """Convertit une valeur Python en littéral RDF typé.

    :param value: valeur reçue de l'interface (nombre, chaîne ou « @Individu »)
    :param property_name: nom de la propriété, pour lire son rdfs:range
    """
    declared = range_datatype(property_name) if property_name else None

    if isinstance(value, bool):
        return Literal(value, datatype=declared or XSD.boolean).n3()
    if isinstance(value, int):
        return Literal(value, datatype=declared or XSD.integer).n3()
    if isinstance(value, float):
        return Literal(value, datatype=declared or XSD.double).n3()
    if isinstance(value, str) and value.startswith("@") and valid(value[1:]):
        # Relation vers un autre individu : on stocke une IRI, pas un littéral.
        return iri(value[1:])
    if declared == XSD.dateTime:
        # Une date ISO-8601 est conservée telle quelle avec son datatype.
        return Literal(str(value), datatype=XSD.dateTime).n3()
    if declared == XSD.date:
        return Literal(str(value), datatype=XSD.date).n3()
    if declared is not None:
        return Literal(str(value), datatype=declared).n3()
    return Literal(str(value)).n3()


def save():
    with GRAPH_LOCK:
        g.serialize(destination=DATA_FILE, format=FORMAT)


def exists(name):
    return sparql_query(f"ASK {{ {iri(name)} ?p ?o }}").askAnswer


def err(message, code=400):
    return jsonify({"error": message}), code


@app.get("/api/classes")
def list_classes():
    query = f'''SELECT DISTINCT ?c WHERE {{
      ?c a owl:Class .
      FILTER(STRSTARTS(STR(?c), "{NS}"))
    }} ORDER BY ?c'''
    return jsonify([local(row.c) for row in sparql_query(query)])


@app.get("/api/properties")
def list_properties():
    result = {"objectProperties": [], "dataProperties": []}
    for row in sparql_query("SELECT DISTINCT ?p WHERE { ?p a owl:ObjectProperty }"):
        if str(row.p).startswith(NS):
            result["objectProperties"].append(local(row.p))
    for row in sparql_query("SELECT DISTINCT ?p WHERE { ?p a owl:DatatypeProperty }"):
        if str(row.p).startswith(NS):
            result["dataProperties"].append(local(row.p))
    return jsonify(result)


@app.get("/api/individuals")
def list_individuals():
    cls = request.args.get("type")
    search = request.args.get("search")
    # OWL individuals in this RDF file are typed by their domain class, without
    # explicit owl:NamedIndividual triples. Enumerate resources typed by a class.
    where = ["?t a owl:Class .", "?i a ?t .", f'FILTER(STRSTARTS(STR(?t), "{NS}"))']
    if cls:
        if not valid(cls):
            return err("type invalide")
        where.append(f"?t rdfs:subClassOf* {iri(cls)} .")
    if search:
        where.append(f"FILTER(CONTAINS(LCASE(STR(?i)), {Literal(search.lower()).n3()}))")
    query = "SELECT DISTINCT ?i ?t WHERE { " + " ".join(where) + " } ORDER BY ?i"
    result = {}
    for row in sparql_query(query):
        name = local(row.i)
        result.setdefault(name, {"name": name, "types": []})["types"].append(local(row.t))
    return jsonify(list(result.values()))


@app.post("/api/import/csv")
def import_csv():
    """Importe un CSV UTF-8 avec les colonnes name, type et des propriétés."""
    upload = request.files.get("file")
    if not upload or not upload.filename.lower().endswith(".csv"):
        return err("Veuillez fournir un fichier CSV.")
    try:
        content = upload.stream.read().decode("utf-8-sig")
        dialect = csv.Sniffer().sniff(content[:4096], delimiters=",;\t")
        reader = csv.DictReader(io.StringIO(content), dialect=dialect)
        headers = [h.strip() for h in (reader.fieldnames or [])]
        if not {"name", "type"}.issubset(headers):
            return err("Le CSV doit contenir les colonnes name et type.")
        if len(set(headers)) != len(headers) or any(not h for h in headers):
            return err("Les en-têtes du CSV sont invalides ou dupliqués.")
        property_headers = [h for h in headers if h not in {"name", "type"}]
        known_classes = {local(x) for x in g.subjects(RDF.type, OWL.Class) if str(x).startswith(NS)}
        known_properties = {local(x) for typ in (OWL.ObjectProperty, OWL.DatatypeProperty)
                            for x in g.subjects(RDF.type, typ) if str(x).startswith(NS)}
        unknown = [p for p in property_headers if not valid(p) or p not in known_properties]
        if unknown:
            return err("Propriété(s) inconnue(s) : " + ", ".join(unknown))
        rows, errors, names = [], [], set()
        for line, row in enumerate(reader, start=2):
            name = (row.get("name") or "").strip()
            types = [x.strip() for x in (row.get("type") or "").split("|") if x.strip()]
            if not name and not any((v or "").strip() for v in row.values()):
                continue
            if not valid(name) or not types or any(not valid(t) or t not in known_classes for t in types):
                errors.append(f"Ligne {line} : nom ou classe invalide."); continue
            if name in names or exists(name):
                errors.append(f"Ligne {line} : l'individu {name} existe déjà ou apparaît plusieurs fois."); continue
            names.add(name)
            props = {}
            for prop in property_headers:
                raw = (row.get(prop) or "").strip()
                if raw:
                    props[prop] = [v.strip() for v in raw.split("|") if v.strip()]
            rows.append((name, types, props))
        if errors:
            return jsonify({"error": "Import annulé : corrigez les lignes signalées.", "details": errors}), 400
        triples = []
        for name, types, props in rows:
            triples.append(f"{iri(name)} a owl:NamedIndividual, {', '.join(iri(t) for t in types)} .")
            for prop, values in props.items():
                for value in values:
                    triples.append(f"{iri(name)} {iri(prop)} {to_term(value, prop)} .")
        with GRAPH_LOCK:
            if triples:
                g.update("INSERT DATA { " + " ".join(triples) + " }")
            save()
        return jsonify({"imported": len(rows), "message": f"{len(rows)} individu(s) importé(s)."}), 201
    except (UnicodeDecodeError, csv.Error, ValueError) as exc:
        return err(f"Fichier CSV invalide : {exc}")


@app.get("/api/export/ontology")
def export_ontology():
    formats = {"turtle": ("turtle", "text/turtle", "ttl"),
               "rdfxml": ("xml", "application/rdf+xml", "rdf")}
    requested = request.args.get("format", "turtle").lower()
    if requested not in formats:
        return err("Format non pris en charge. Choisissez turtle ou rdfxml.")
    rdf_format, mimetype, extension = formats[requested]
    with GRAPH_LOCK:
        content = g.serialize(format=rdf_format, encoding="utf-8")
    return Response(content, mimetype=mimetype, headers={
        "Content-Disposition": f'attachment; filename="smartgrid.{extension}"'})


@app.get("/api/individuals/<name>")
def get_individual(name):
    if not valid(name) or not exists(name):
        return err("individu introuvable", 404)
    properties = []
    for row in sparql_query(f"SELECT ?p ?o WHERE {{ {iri(name)} ?p ?o }}"):
        properties.append({
            "property": local(row.p),
            "value": local(row.o) if str(row.o).startswith(NS) else str(row.o),
            "isReference": str(row.o).startswith(NS),
        })
    return jsonify({"name": name, "properties": properties})


@app.post("/api/individuals")
def create_individual():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    types = data.get("type")
    props = data.get("properties", {})
    # `type` accepte une classe unique ou une liste de classes : l'ontologie
    # prévoit des individus multi-types (Prosommateur = Consommateur ET
    # Producteur, l'axiome owl:equivalentClass l'implique).
    if isinstance(types, str):
        types = [types]
    if (not valid(name) or not isinstance(types, list) or not types
            or not all(valid(item) for item in types) or not isinstance(props, dict)):
        return err("name, type et properties valides sont obligatoires")
    if exists(name):
        return err("cet individu existe déjà", 409)
    triples = [
        f"{iri(name)} a owl:NamedIndividual, {', '.join(iri(item) for item in types)} ."
    ]
    for prop, value in props.items():
        if not valid(prop):
            return err(f"propriété invalide : {prop}")
        # Une propriété peut porter plusieurs valeurs (plusieurs relations du
        # même type) : l'API accepte alors une liste au lieu d'une chaîne.
        for one in (value if isinstance(value, list) else [value]):
            triples.append(f"{iri(name)} {iri(prop)} {to_term(one, prop)} .")
    with GRAPH_LOCK:
        g.update("INSERT DATA { " + " ".join(triples) + " }")
    save()
    return jsonify({"message": "créé", "name": name}), 201


@app.put("/api/individuals/<name>")
def update_individual(name):
    if not valid(name) or not exists(name):
        return err("individu introuvable", 404)
    data = request.get_json(silent=True) or {}
    props = data.get("properties", {})
    if not isinstance(props, dict):
        return err("properties doit être un objet JSON")
    for prop, value in props.items():
        if not valid(prop):
            return err(f"propriété invalide : {prop}")
        with GRAPH_LOCK:
            g.update(f"DELETE WHERE {{ {iri(name)} {iri(prop)} ?o }}")
            for one in (value if isinstance(value, list) else [value]):
                g.update(f"INSERT DATA {{ {iri(name)} {iri(prop)} {to_term(one, prop)} }}")
    save()
    return jsonify({"message": "modifié", "name": name})


@app.delete("/api/individuals/<name>")
def delete_individual(name):
    if not valid(name) or not exists(name):
        return err("individu introuvable", 404)
    with GRAPH_LOCK:
        g.update(f"DELETE WHERE {{ {iri(name)} ?p ?o }}")
        g.update(f"DELETE WHERE {{ ?s ?p {iri(name)} }}")
    save()
    return jsonify({"message": "supprimé", "name": name})


def execute_query(query):
    """Exécute une requête SPARQL (SELECT ou ASK) et renvoie le résultat JSON.

    Les valeurs appartenant à l'ontologie sont renvoyées sans namespace.
    """
    result = sparql_query(query)
    if result.type == "ASK":
        return {"ask": bool(result.askAnswer)}
    if result.type != "SELECT":
        raise ValueError("seules les requêtes SELECT et ASK sont autorisées")
    columns = [str(value) for value in result.vars]
    rows = [[local(cell) if cell is not None and str(cell).startswith(NS)
             else (str(cell) if cell is not None else None) for cell in row]
            for row in result]
    return {"columns": columns, "rows": rows}


@app.post("/api/sparql")
def run_sparql():
    data = request.get_json(silent=True) or {}
    query = data.get("query", "")
    if not isinstance(query, str):
        return err("query doit être une chaîne")
    try:
        return jsonify(execute_query(query))
    except Exception as exc:
        if app.debug:
            traceback.print_exc()
        return err(f"requête invalide : {exc}")


@app.post("/api/ask")
def ask():
    """Module NLP : traduit une question en français en requête SPARQL.

    La route renvoie la requête générée (pour l'afficher) et son résultat.
    """
    data = request.get_json(silent=True) or {}
    question = data.get("question", "")
    if not isinstance(question, str) or not question.strip():
        return err("question est obligatoire")

    try:
        with GRAPH_LOCK:
            query = nlp.translate(question, g, NS)
    except nlp.TranslationError as exc:
        return err(str(exc))
    except Exception as exc:
        if app.debug:
            traceback.print_exc()
        return err(f"analyse de la question impossible : {exc}")

    try:
        result = execute_query(query)
    except Exception as exc:
        return err(f"requête générée invalide : {exc} — {query}")

    return jsonify({"sparql": query, "result": result})


@app.get("/api/health")
def health():
    return jsonify({"triples": len(g), "namespace": NS})


if __name__ == "__main__":
    print(f"{len(g)} triplets chargés — namespace : {NS}")
    # Sous Windows, le reloader de debug laisse des processus enfants orphelins
    # qui continuent d'occuper le port 5000 : FLASK_RELOAD=0 permet de l'en
    # Empêcher (utile quand plusieurs instances doivent tourner en série).
    use_reloader = os.environ.get("FLASK_RELOAD", "1") != "0"
    debug = os.environ.get("FLASK_DEBUG", "1") != "0"
    app.run(debug=debug, port=5000, use_reloader=use_reloader)
