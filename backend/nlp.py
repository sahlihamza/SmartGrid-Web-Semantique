"""
Module NLP : traduction d'une question en français vers une requête SPARQL
sur l'ontologie « Énergie et Smart Grid ».

Le module est volontairement *agnostique* vis-à-vis de l'ontologie : les classes,
propriétés et individus sont lus dynamiquement dans le graphe RDF. Seules les
expressions lexicales françaises (qui ne figurent pas telles quelles dans
l'ontologie : « éolien », « capacité », « piloté par »…) sont fournies ici.

Déroulement d'une traduction :

  1. normalisation de la question (minuscules, suppression des accents, pluriels) ;
  2. analyse spaCy (lemmes, entités nommées, vecteurs de mots) ;
  3. appariement avec l'ontologie : classes, propriétés, individus ;
  4. détection de l'intention (compter / lister / valeur / relation / existence) ;
  5. génération de la requête SPARQL.

Ce module ne fait QUE traduire : l'exécution de la requête et la mise en forme
du résultat restent à la charge de app.py.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

import spacy
from rdflib import OWL, RDF, RDFS

# ---------------------------------------------------------------------------
# 1. Lexique français -> termes de l'ontologie
# ---------------------------------------------------------------------------

# Classes : une expression peut correspondre à plusieurs classes (une notion
# « production solaire » couvre à la fois une centrale et une source d'énergie).
CLASS_SYNONYMS: dict[str, list[str]] = {
    'CentraleSolaire': [
        'centrale solaire', 'production solaire', 'centrale photovoltaique',
        'photovoltaique', 'solaire', 'panneau solaire', 'centrale pv',
    ],
    'CentraleEolienne': [
        'centrale eolienne', 'parc eolien', 'production eolienne',
        'energie eolienne', 'eolienne', 'eolien', 'aerogenerateur',
        'centrale a vent',
    ],
    'CentraleThermique': ['centrale thermique', 'thermique', 'production thermique'],
    'CentraleNucleaire': ['centrale nucleaire', 'nucleaire'],
    'CentraleRenouvelable': ['centrale renouvelable'],
    'Centrale': ['centrale', 'centrales', 'centrale de production'],
    'EnergieSolaire': ['energie solaire', 'source solaire', 'soleil', 'solaire', 'production solaire'],
    'EnergieEolienne': ['energie eolienne', 'energie du vent', 'vent'],
    'EnergieHydraulique': ['energie hydraulique', 'hydraulique', 'barrage', 'energie de l\'eau'],
    'EnergieFossile': ['energie fossile', 'fossile', 'charbon', 'petrole', 'gaz'],
    'EnergieNucleaire': ['energie nucleaire'],
    'EnergieRenouvelable': ['energie renouvelable', 'renouvelable', 'energies renouvelables'],
    'Batterie': ['batterie', 'batteries', 'accumulateur', 'banc de batterie'],
    'SystemeStockage': ['systeme de stockage', 'systeme de stockage d\'energie', 'stockage'],
    'Consommateur': ['consommateur', 'consommateurs', 'client', 'usager', 'foyer'],
    'Producteur': ['producteur', 'producteurs', 'producteur d\'energie'],
    'Prosommateur': ['prosommateur', 'prosommateurs'],
    'GestionnaireReseau': [
        'gestionnaire de reseau', 'gestionnaire', 'dispatcheur', 'operateur',
        'operateur de reseau',
    ],
    'ReseauIntelligent': ['reseau intelligent', 'smart grid', 'reseau electrique intelligent'],
    'ReseauElectrique': ['reseau electrique', 'reseau', 'ligne electrique', 'ligne'],
    'Equipement': ['equipement', 'equipements', 'materiel'],
    'Installation': ['installation', 'installations', 'site'],
    'Capteur': ['capteur', 'capteurs', 'sonde'],
    'Transformateur': ['transformateur', 'transformateurs'],
    'Onduleur': ['onduleur', 'onduleurs', 'onduleur solaire'],
    'CompteurIntelligent': [
        'compteur intelligent', 'compteur', 'compteurs', 'linky', 'compteur linky',
    ],
    'Acteur': ['acteur', 'acteurs', 'intervenant'],
    'SourceEnergie': ['source d\'energie', 'source energetique'],
}

# Classes « génériques » : si une classe plus spécifique est aussi reconnue dans
# la question, la classe générique est écartée (« équipements de production
# solaire » -> on ne veut pas tous les équipements).
GENERIC_CLASSES = {
    'Equipement', 'Installation', 'Acteur', 'SourceEnergie', 'Centrale',
}

# Propriétés de données (valeurs).
DATA_PROPERTY_SYNONYMS: dict[str, list[str]] = {
    'aPourCapacite': [
        'capacite', 'capacite de stockage', 'capacite de la batterie',
        'capacite en kwh',
    ],
    'aPourPuissance': [
        'puissance', 'puissance de production', 'puissance installee', 'puissance en mw',
    ],
    'aPourNiveauCharge': [
        'niveau de charge', 'etat de charge', 'taux de charge', 'charge',
        'niveau de charge de la batterie',
    ],
    'aPourNom': ['nom', 'nom de l\'individu', 'libelle', 'denomination'],
    'aPourDateReleve': [
        'date de releve', 'date de mesure', 'horodatage', 'timestamp', 'date',
    ],
}

# Propriétés d'objets (relations). « par » signale une tournure passive :
# « le réseau est piloté par STEG » -> STEG est le sujet, le réseau l'objet.
# Les formes conjuguées (« alimentent », « gèrent ») sont listées car le
# singulier approximatif ne les ramène pas à l'infinitif.
OBJECT_PROPERTY_SYNONYMS: dict[str, list[str]] = {
    'alimente': ['alimente', 'alimentent', 'alimentation', 'fournit l\'energie', 'alimente en'],
    'consomme': ['consomme', 'consomment', 'consommation'],
    'estConnecteA': [
        'est connecte a', 'connecte a', 'connecte au', 'relie a', 'raccordement',
        'branchement', 'branche sur', 'connecte', 'connectent', 'relie', 'relient',
        'raccorde', 'raccordent',
    ],
    'gere': [
        'gere', 'gerent', 'gere par', 'pilote', 'pilote par', 'administre',
        'exploite', 'est gere par', 'est pilote par', 'pilotes',
    ],
    'mesure': ['mesure', 'mesurent', 'releve', 'mesure la', 'releve la'],
    'produit': ['produit', 'produisent', 'produit de', 'produit l\'energie'],
    'stocke': ['stocke', 'stockent', 'stocke dans', 'stockage de'],
    'utiliseSource': [
        'utilise', 'utilisent', 'utilisee', 'utilise la source', 'source utilisee',
        'fonctionne avec', 's\'appuie sur',
    ],
}

# Mots outils écartés de l'appariement par n-grammes (mais « par » reste
# analysé à part car il détermine le sens d'une relation passive).
STOPWORDS = {
    'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'l', 'd', 'a', 'au', 'aux',
    'en', 'et', 'est', 'sont', 'etre', 'ont', 'pour', 'par', 'sur', 'dans',
    'avec', 'sans', 'sous', 'qui', 'que', 'quoi', 'quel', 'quelle', 'quels',
    'quelles', 'combien', 'y', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
    'ce', 'cette', 'cet', 'ces', 'son', 'sa', 'ses', 'leur', 'leurs', 'mon', 'ma',
    'mes', 'ton', 'ta', 'tes', 'notre', 'votre', 'peut', 'peuvent', 'doit',
    'doivent', 'faut', 'y a t il', 'est ce que', 'quelque', 'autres', 'montre',
    'moi', 'nous', 'te', 'toi', 'lui', 'tout', 'tous', 'toute', 'toutes',
}

# Marqueurs d'intention.
COUNT_MARKERS = ('combien', 'nombre de', 'nombre', 'quantite', 'total', 'combien de')
ASK_MARKERS = ('est ce que', 'y a t il', 'existe t il', 'existe', 'peut on', 'sait on')
LIST_MARKERS = (
    'quels', 'quelles', 'quel', 'liste', 'lister', 'montre', 'montrer',
    'donne', 'donner', 'affiche', 'afficher', 'reperer', 'trouve',
)
VALUE_MARKERS = (
    'quelle est la valeur', 'quel est le', 'quelle est le', 'quelle est la',
    'combien vaut', 'quelle valeur', 'quel valeur',
)

# Pluriels irréguliers du français (le reste est traité par la règle simple).
IRREGULAR_PLURALS = {
    'resaux': 'reseau', 'chateaux': 'chateau', 'travaux': 'travail',
    'bijoux': 'bijou', 'cheveux': 'cheveu', 'genoux': 'genou',
}

_NLP = None

# Nombre maximal de lignes renvoyées par les requêtes générées.
RESULT_LIMIT = 50


def get_nlp():
    """Charge (une seule fois) le modèle français de spaCy."""
    global _NLP
    if _NLP is None:
        for model in ('fr_core_news_md', 'fr_core_news_sm'):
            try:
                _NLP = spacy.load(model)
                break
            except OSError:
                continue
        if _NLP is None:
            # Repli : sans modèle, la traduction reste possible via le lexique.
            _NLP = spacy.blank('fr')
    return _NLP


class TranslationError(Exception):
    """Levée lorsque la question ne peut pas être traduite en SPARQL."""


# ---------------------------------------------------------------------------
# 2. Normalisation du texte
# ---------------------------------------------------------------------------

def strip_accents(text: str) -> str:
    """« éolienne » -> « eolienne »."""
    return ''.join(
        char for char in unicodedata.normalize('NFD', text)
        if unicodedata.category(char) != 'Mn'
    )


def normalize(text: str) -> str:
    """Minuscules, sans accents ni ponctuation, espaces normalisés."""
    text = strip_accents(text.lower())
    text = text.replace("'", ' ').replace('\u2019', ' ').replace('-', ' ')
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def singularize(token: str) -> str:
    """Approximation « pluriel -> singulier » suffisante pour notre lexique.

    « centrales » -> « centrale », « eoliennes » -> « eolienne ».
    """
    if token in IRREGULAR_PLURALS:
        return IRREGULAR_PLURALS[token]
    if len(token) > 3 and token.endswith('s') and not token.endswith('ss'):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    """Découpe normalisée d'un texte en jetons (pluriels conservés)."""
    return normalize(text).split()


def match_tokens(text: str) -> list[str]:
    """Jetons normalisés et singulérisés, pour l'appariement avec l'ontologie."""
    return [singularize(token) for token in tokenize(text)]


def content_tokens(text: str) -> list[str]:
    """Jetons significatifs (hors mots outils)."""
    return [token for token in match_tokens(text) if token not in STOPWORDS]


def camel_to_words(name: str) -> str:
    """« CentraleSolaire » -> « centrale solaire », « aPourCapacite » -> « a pour capacite ».

    Le chiffre final est séparé du mot qui le précède (« BatterieTesla1 » ->
    « batterie tesla 1 ») sans quoi le nom deviendrait introuvable dans une
    question où il est écrit en toutes lettres.
    """
    parts = re.findall(r'[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+', name)
    words: list[str] = []
    for part in parts:
        match = re.fullmatch(r'([A-Za-z]+)(\d+)', part)
        if match:
            words.append(match.group(1))
            words.append(match.group(2))
        else:
            words.append(part)
    return ' '.join(word.lower() for word in words)


def local_name(iri: str, namespace: str) -> str:
    """Nom local d'un IRI appartenant à l'espace de noms de l'ontologie."""
    if iri.startswith(namespace):
        return iri[len(namespace):]
    return iri.rsplit('#', 1)[-1].rsplit('/', 1)[-1]


# ---------------------------------------------------------------------------
# 3. Index de l'ontologie (lu dynamiquement dans le graphe)
# ---------------------------------------------------------------------------

@dataclass
class OntologyIndex:
    namespace: str
    classes: list[str] = field(default_factory=list)
    class_parents: dict[str, set[str]] = field(default_factory=dict)
    object_properties: list[str] = field(default_factory=list)
    object_domains: dict[str, str] = field(default_factory=dict)
    object_ranges: dict[str, str] = field(default_factory=dict)
    data_properties: list[str] = field(default_factory=list)
    data_ranges: dict[str, str] = field(default_factory=dict)
    individuals: list[str] = field(default_factory=list)
    individual_types: dict[str, list[str]] = field(default_factory=dict)

    def subtypes(self, class_name: str) -> set[str]:
        """Classes concrètes comprises dans `class_name` (héritage inclus)."""
        result = {class_name}
        pending = [class_name]
        while pending:
            current = pending.pop()
            for child, parents in self.class_parents.items():
                if current in parents and child not in result:
                    result.add(child)
                    pending.append(child)
        return result

    def types_of(self, individual: str) -> list[str]:
        return self.individual_types.get(individual, [])


def build_ontology_index(graph, namespace: str) -> OntologyIndex:
    """Construit l'index des classes, propriétés et individus présents dans le graphe."""
    index = OntologyIndex(namespace=namespace)

    in_ns = lambda term: str(term).startswith(namespace)

    # Classes et hiérarchie.
    for subject in graph.subjects(RDF.type, OWL.Class):
        if in_ns(subject):
            index.classes.append(local_name(str(subject), namespace))
    for child, parent in graph.subject_objects(RDFS.subClassOf):
        if in_ns(child) and in_ns(parent):
            index.class_parents.setdefault(
                local_name(str(child), namespace), set()
            ).add(local_name(str(parent), namespace))

    # Propriétés.
    for subject in graph.subjects(RDF.type, OWL.ObjectProperty):
        if in_ns(subject):
            index.object_properties.append(local_name(str(subject), namespace))
    for subject in graph.subjects(RDF.type, OWL.DatatypeProperty):
        if in_ns(subject):
            index.data_properties.append(local_name(str(subject), namespace))

    for subject in graph.subjects(RDFS.domain, None):
        if in_ns(subject):
            name = local_name(str(subject), namespace)
            target = graph.value(subject, RDFS.domain)
            if target is None:
                continue
            if name in index.object_properties:
                index.object_domains[name] = local_name(str(target), namespace)
            elif name in index.data_properties:
                index.data_ranges[name] = local_name(str(target), namespace)
    for subject in graph.subjects(RDFS.range, None):
        if in_ns(subject):
            name = local_name(str(subject), namespace)
            target = graph.value(subject, RDFS.range)
            if target is None:
                continue
            if name in index.object_properties:
                index.object_ranges[name] = local_name(str(target), namespace)
            elif name in index.data_properties:
                index.data_ranges[name] = local_name(str(target), namespace)

    # Individus : ressources typées par une classe de l'ontologie.
    class_set = set(index.classes)
    types_by_individual: dict[str, set[str]] = {}
    for individual, kind in graph.subject_objects(RDF.type):
        if not in_ns(individual):
            continue
        type_name = local_name(str(kind), namespace)
        if type_name in class_set:
            types_by_individual.setdefault(
                local_name(str(individual), namespace), set()
            ).add(type_name)

    for name, types in types_by_individual.items():
        index.individuals.append(name)
        index.individual_types[name] = sorted(types)

    index.classes = sorted(set(index.classes))
    index.object_properties = sorted(set(index.object_properties))
    index.data_properties = sorted(set(index.data_properties))
    index.individuals = sorted(index.individuals)
    return index


# ---------------------------------------------------------------------------
# 4. Appariement question <-> ontologie
# ---------------------------------------------------------------------------

@dataclass
class Match:
    """Correspondance trouvée entre la question et un terme de l'ontologie."""
    payload: str
    length: int
    position: int


def _surface_forms(index: OntologyIndex) -> list[tuple[list[str], str, str]]:
    """Construit la liste (jetons, type, charge utile) des expressions cherchables."""
    forms: list[tuple[list[str], str, str]] = []

    for class_name in index.classes:
        # Surface automatique : « CentraleSolaire » -> « centrale solaire ».
        auto = camel_to_words(class_name).split()
        if len(auto) > 1:
            forms.append(([singularize(token) for token in auto], 'class', class_name))
        for synonym in CLASS_SYNONYMS.get(class_name, []):
            forms.append(
                ([singularize(token) for token in normalize(synonym).split()], 'class', class_name)
            )

    for property_name in index.data_properties:
        for synonym in DATA_PROPERTY_SYNONYMS.get(property_name, []):
            forms.append(
                ([singularize(token) for token in normalize(synonym).split()], 'data', property_name)
            )

    for property_name in index.object_properties:
        for synonym in OBJECT_PROPERTY_SYNONYMS.get(property_name, []):
            forms.append(
                ([singularize(token) for token in normalize(synonym).split()], 'object', property_name)
            )

    # Formes trop génériques : inutiles et sources de faux positifs.
    return [form for form in forms if form[0] and form[0] != ['source']]


def _find_matches(tokens: list[str], forms: list[tuple[list[str], str, str]]) -> list[Match]:
    """Recherche toutes les expressions présentes dans la suite de jetons.

    Pour chaque position, on ne conserve que la correspondance la plus longue
    (« centrale solaire » l'emporte sur « centrale »), mais toutes les classes
    atteignant cette longueur sont conservées : « production solaire » désigne
    à la fois une centrale et une source d'énergie.
    """
    best_length: dict[int, int] = {}
    found: list[Match] = []

    for surface, kind, payload in forms:
        length = len(surface)
        if length == 0 or length > len(tokens):
            continue
        for start in range(len(tokens) - length + 1):
            if tokens[start:start + length] == surface:
                if length > best_length.get(start, 0):
                    best_length[start] = length
                break

    for surface, kind, payload in forms:
        length = len(surface)
        if length == 0 or length > len(tokens):
            continue
        for start in range(len(tokens) - length + 1):
            if tokens[start:start + length] == surface:
                if length == best_length.get(start):
                    found.append(
                        Match(payload=f'{kind}:{payload}', length=length, position=start)
                    )
                break

    return sorted(found, key=lambda m: (m.position, -m.length))


def _match_individuals(
    tokens: list[str], index: OntologyIndex, class_ngrams: set[tuple[str, ...]]
) -> list[Match]:
    """Appariement des individus.

    Deux strategies sont combinées :
      * n-grammes de jetons — « la batterie Tesla » -> « BatterieTesla1 » ;
      * forme « à plat » — « CentraleSolaireGabes » écrit sans espace.
    """
    matches: list[Match] = []
    token_set = set(tokens)

    for individual in index.individuals:
        split_tokens = [singularize(token) for token in camel_to_words(individual).split()]
        flat_tokens = [singularize(token) for token in normalize(individual).split()]

        # -- N-grammes sur le nom « à plat » (« centrallesolairegabes ») --------
        flat_size = len(flat_tokens)
        flat_position = -1
        for start in range(len(tokens) - flat_size + 1):
            if tokens[start:start + flat_size] == flat_tokens:
                flat_position = start
                break

        # -- N-grammes sur le nom « découpé » (« centrale », « solaire », …) ---
        found = 0
        split_position = -1
        for size in range(len(split_tokens), 1, -1):
            for start in range(len(split_tokens) - size + 1):
                gram = tuple(split_tokens[start:start + size])
                # Un n-gramme identique à un nom de classe désigne la classe,
                # pas l'individu (« centrale solaire » ne vaut pas
                # « CentraleSolaireGabes »).
                if gram in class_ngrams:
                    continue
                for pos in range(len(tokens) - size + 1):
                    if tokens[pos:pos + size] == list(gram):
                        found = size
                        split_position = pos
                        break
                if found:
                    break
            if found:
                break

        # Un nom d'individu d'un seul mot (« STEG ») se reconnaît tel quel.
        if len(split_tokens) == 1 and split_tokens[0] in token_set:
            matches.append(
                Match(f'individual:{individual}', 1, tokens.index(split_tokens[0]))
            )
            continue

        if flat_position != -1:
            matches.append(Match(f'individual:{individual}', flat_size, flat_position))
        elif found >= 2:
            matches.append(Match(f'individual:{individual}', found, split_position))

    return matches


def _contains_phrase(tokens: list[str], phrase: str) -> bool:
    """Vrai si une expression (normalisée) apparaît dans la suite de jetons."""
    needle = [singularize(token) for token in normalize(phrase).split()]
    if not needle:
        return False
    size = len(needle)
    return any(
        tokens[start:start + size] == needle
        for start in range(len(tokens) - size + 1)
    )


# ---------------------------------------------------------------------------
# 5. Détection d'intention et génération de la requête
# ---------------------------------------------------------------------------

def _iri(index: OntologyIndex, name: str) -> str:
    """Représentation SPARQL d'un terme : « sg:Name » ou <iri complet>."""
    if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]*', name):
        return f'sg:{name}'
    return f'<{index.namespace}{name}>'


def _class_pattern(index: OntologyIndex, classes: list[str], variable: str = '?i') -> str:
    """Bloc SPARQL restreignant une variable aux classes demandées.

    L'héritage est pris en compte (`rdfs:subClassOf*`) : comme le filtre
    `?type=` de l'API, une classe mother englobe ses sous-classes
    (« centrale » -> CentraleSolaire, CentraleEolienne…).
    """
    suffix = variable[1:]
    if len(classes) == 1:
        return (
            f'  {variable} a ?{suffix}classe .\n'
            f'  ?{suffix}classe rdfs:subClassOf* {_iri(index, classes[0])} .\n'
        )
    values = ' '.join(_iri(index, name) for name in classes)
    return (
        f'  {variable} a ?{suffix}classe .\n'
        f'  ?{suffix}classe rdfs:subClassOf* ?{suffix}cible .\n'
        f'  VALUES ?{suffix}cible {{ {values} }}\n'
    )


def _individual_is(index: OntologyIndex, individual: str, class_name: str) -> bool:
    """Vrai si l'individu est de la classe donnée (ou d'une sous-classe)."""
    types = set(index.types_of(individual))
    return bool(types & index.subtypes(class_name))


def _relation_role(
    index: OntologyIndex,
    property_name: str,
    individual: str,
    tokens: list[str],
    position: int,
) -> str:
    """Rôle d'un individu dans une relation : « subject » ou « object ».

    On s'appuie sur le domaine et la plage de la propriété ; en cas d'ambiguïté,
    la tournure passive (« piloté par STEG ») tranche : l'agent situé après
    « par » est le sujet.
    """
    domain = index.object_domains.get(property_name)
    range_ = index.object_ranges.get(property_name)
    types = set(index.types_of(individual))

    if domain and (types & index.subtypes(domain)):
        return 'subject'
    if range_ and (types & index.subtypes(range_)):
        return 'object'

    if 'par' in tokens:
        par_position = tokens.index('par')
        if position > par_position:
            return 'subject'
        if position < par_position:
            return 'object'

    return 'subject'


def translate(question: str, graph, namespace: str) -> str:
    """Traduit une question française en requête SPARQL.

    :param question: la question posée par l'utilisateur
    :param graph: le graphe RDF (pour lire l'ontologie)
    :param namespace: espace de noms de l'ontologie
    :returns: la requête SPARQL générée
    :raises TranslationError: si la question n'est pas comprise
    """
    index = build_ontology_index(graph, namespace)
    nlp = get_nlp()

    normalized = normalize(question)
    raw_tokens = tokenize(question)
    tokens = match_tokens(question)
    contents = content_tokens(question)

    # -- Analyse spaCy : lemmes et entités nommées ----------------------------
    doc = nlp(question)
    named_entities = [
        (strip_accents(entity.text).lower(), entity.label_) for entity in doc.ents
    ]

    forms = _surface_forms(index)
    matches = _find_matches(tokens, forms)

    class_ngrams = {tuple(form[0]) for form in forms if form[1] == 'class'}
    matches += _match_individuals(tokens, index, class_ngrams)

    # Regroupement par type de correspondance.
    classes: list[str] = []
    data_properties: list[str] = []
    object_properties: list[str] = []
    individuals: list[tuple[str, int]] = []

    for match in sorted(matches, key=lambda m: (-m.length, m.position)):
        kind, _, payload = match.payload.partition(':')
        if kind == 'class' and payload not in classes:
            classes.append(payload)
        elif kind == 'data' and payload not in data_properties:
            data_properties.append(payload)
        elif kind == 'object' and payload not in object_properties:
            object_properties.append(payload)
        elif kind == 'individual' and payload not in [name for name, _ in individuals]:
            individuals.append((payload, match.position))

    # Les entités nommées de spaCy peuvent aussi désigner un individu
    # (« STEG », « Tesla »).
    for entity_text, _label in named_entities:
        for individual in index.individuals:
            name_tokens = camel_to_words(individual).split()
            if entity_text in name_tokens and individual not in [n for n, _ in individuals]:
                individuals.append((individual, -1))

    # -- Intentions ------------------------------------------------------------
    is_count = any(_contains_phrase(tokens, marker) for marker in COUNT_MARKERS)
    is_ask = any(_contains_phrase(tokens, marker) for marker in ASK_MARKERS)
    is_list = any(_contains_phrase(tokens, marker) for marker in LIST_MARKERS)
    is_value = any(_contains_phrase(tokens, marker) for marker in VALUE_MARKERS)

    # -- Gabarit 1 : question de comptage --------------------------------------
    if is_count and classes and not individuals:
        target = _class_pattern(index, classes)
        return 'SELECT (COUNT(DISTINCT ?i) AS ?nombre) WHERE {\n' + target + '}'

    # -- Gabarit 2 : question portant sur une relation -------------------------
    if object_properties:
        property_name = object_properties[0]
        individual = individuals[0][0] if individuals else None
        individual_position = individuals[0][1] if individuals else -1
        role = (
            _relation_role(index, property_name, individual, tokens, individual_position)
            if individual
            else None
        )

        domain = index.object_domains.get(property_name)
        range_ = index.object_ranges.get(property_name)

        # Chaque classe reconnue décrit l'une des deux extrémités de la relation.
        # On la rattache au sujet ou à l'objet selon le domaine et la plage.
        for_individual: list[str] = []
        for_answer: list[str] = []

        # Une classe qui ne correspond ni au domaine ni à la plage est « orpheline » :
        # c'est souvent le mot « solaire » qui a fait matcher « centrale solaire »
        # ET « énergie solaire » dans « qui produit de l'énergie solaire ? ». Si
        # d'autres classes conviennent, on écarte les orphelines plutôt que de
        # restreindre la réponse à un type qui n'a rien à voir avec la relation.
        def fits(name: str) -> bool:
            if domain and name in index.subtypes(domain):
                return True
            if range_ and name in index.subtypes(range_):
                return True
            return bool(individual) and _individual_is(index, individual, name)

        relevant = [name for name in classes if fits(name)]
        usable = relevant if relevant else classes

        for name in usable:
            if domain and name in index.subtypes(domain):
                target = for_individual if role == 'subject' else for_answer
            elif range_ and name in index.subtypes(range_):
                target = for_answer if role == 'subject' else for_individual
            elif individual and _individual_is(index, individual, name):
                target = for_individual
            else:
                target = for_answer
            target.append(name)

        lines: list[str] = []
        if for_answer:
            lines.append(_class_pattern(index, for_answer).rstrip('\n'))

        if individual is None:
            # Relation générique : la réponse est le sujet, l'autre bout est libre.
            lines.append(f'  ?i {_iri(index, property_name)} ?autre .')
            if for_individual:
                lines.append(_class_pattern(index, for_individual, '?autre').rstrip('\n'))
        elif role == 'subject':
            # L'individu est le sujet : on cherche ce qu'il est relié à.
            lines.append(
                f'  {_iri(index, individual)} {_iri(index, property_name)} ?i .'
            )
        else:
            # L'individu est l'objet : on cherche qui lui est relié.
            lines.append(
                f'  ?i {_iri(index, property_name)} {_iri(index, individual)} .'
            )

        if is_count:
            return (
                'SELECT (COUNT(DISTINCT ?i) AS ?nombre) WHERE {\n'
                + '\n'.join(lines) + '\n}'
            )
        return (
            f'SELECT DISTINCT ?i WHERE {{\n'
            + '\n'.join(lines) + f'\n}}\nLIMIT {RESULT_LIMIT}'
        )

    # -- Gabarit 3 : valeur d'une propriété pour un individu -------------------
    #    (« quelle est la capacité de la batterie Tesla ? »)
    if data_properties and individuals:
        property_name = data_properties[0]
        individual = individuals[0][0]
        if property_name == 'aPourNom':
            # L'ontologie ne renseigne pas toujours aPourNom : on retombe alors
            # sur le nom local de l'IRI, qui est le nom de l'individu.
            subject = _iri(index, individual)
            return (
                'SELECT ?valeur WHERE {\n'
                f'  OPTIONAL {{ {subject} {_iri(index, property_name)} ?nom }}\n'
                f'  BIND(COALESCE(?nom, REPLACE(STR({subject}), "^.*[#/]", "")) AS ?valeur)\n'
                '}\nLIMIT 1'
            )
        return (
            'SELECT ?valeur WHERE {\n'
            f'  {_iri(index, individual)} {_iri(index, property_name)} ?valeur .\n'
            f'}}\nLIMIT 1'
        )

    # -- Gabarit 4 : toutes les propriétés d'un individu ----------------------
    if individuals and _contains_phrase(tokens, 'propriete'):
        return (
            'SELECT ?propriete ?valeur WHERE {\n'
            f'  {_iri(index, individuals[0][0])} ?propriete ?valeur .\n'
            '  FILTER(?propriete != rdf:type)\n'
            f'}}\nLIMIT {RESULT_LIMIT}'
        )

    # -- Gabarit 5 : valeur d'une propriété pour tous les individus d'une classe
    #    (« les noms des batteries », « la puissance des centrales solaires »)
    if data_properties and classes and not individuals:
        property_name = data_properties[0]
        specific = [name for name in classes if name not in GENERIC_CLASSES]
        target_classes = specific or classes
        lines = [_class_pattern(index, target_classes).rstrip('\n')]
        if property_name == 'aPourNom':
            # Même repli que pour un individu isolé : le nom est le nom local
            # de l'IRI tant que l'ontologie ne fournit pas aPourNom.
            lines.append(f'  OPTIONAL {{ ?i {_iri(index, property_name)} ?nom }}')
            lines.append('  BIND(COALESCE(?nom, REPLACE(STR(?i), "^.*[#/]", "")) AS ?valeur)')
        else:
            lines.append(f'  ?i {_iri(index, property_name)} ?valeur .')
        if is_count:
            return (
                'SELECT (COUNT(DISTINCT ?valeur) AS ?nombre) WHERE {\n'
                + '\n'.join(lines) + '\n}'
            )
        return (
            'SELECT DISTINCT ?valeur WHERE {\n'
            + '\n'.join(lines) + f'\n}}\nLIMIT {RESULT_LIMIT}'
        )

    # -- Gabarit 6 : individus d'une classe ------------------------------------
    if classes:
        # Une classe générique est écartée si une classe précise a été reconnue.
        specific = [name for name in classes if name not in GENERIC_CLASSES]
        target_classes = specific or classes
        target = _class_pattern(index, target_classes)

        if is_ask:
            return 'ASK {\n' + target + '}'

        if is_count:
            return 'SELECT (COUNT(DISTINCT ?i) AS ?nombre) WHERE {\n' + target + '}'

        if len(target_classes) == 1:
            return f'SELECT DISTINCT ?i WHERE {{\n{target}}}\nLIMIT {RESULT_LIMIT}'

        return (
            'SELECT DISTINCT ?i ?classe WHERE {\n'
            '  ?i a ?classe .\n'
            '  ?classe rdfs:subClassOf* ?cible .\n'
            '  VALUES ?cible { '
            + ' '.join(_iri(index, name) for name in target_classes)
            + f' }}\n}}\nLIMIT {RESULT_LIMIT}'
        )

    # -- Gabarit 7 : existence d'un individu ----------------------------------
    if individuals and is_ask:
        return (
            'ASK {\n'
            f'  {_iri(index, individuals[0][0])} a ?classe .\n'
            '}'
        )

    # -- Gabarit 8 : individu sans classe -> toutes ses propriétés -----------
    if individuals:
        return (
            'SELECT ?propriete ?valeur WHERE {\n'
            f'  {_iri(index, individuals[0][0])} ?propriete ?valeur .\n'
            f'}}\nLIMIT {RESULT_LIMIT}'
        )

    # -- Gabarit 9 : dernier recours, appariement par vecteurs de mots --------
    guess = _guess_class_by_vectors(doc, index)
    if guess:
        target = _class_pattern(index, [guess])
        if is_count:
            return 'SELECT (COUNT(DISTINCT ?i) AS ?nombre) WHERE {\n' + target + '}'
        return f'SELECT DISTINCT ?i WHERE {{\n{target}}}\nLIMIT {RESULT_LIMIT}'

    raise TranslationError(
        "Je n'ai pas compris la question. Reformulez-la en précisant un équipement "
        "de l'ontologie (centrale solaire, batterie, compteur, réseau, consommateur…) "
        "ou une propriété (capacité, puissance, niveau de charge)."
    )


def _guess_class_by_vectors(doc, index: OntologyIndex) -> str | None:
    """Dernier recours : classer la question avec les vecteurs de mots de spaCy."""
    if not doc.has_vector or not index.classes:
        return None

    scored: list[tuple[float, str]] = []
    for class_name in index.classes:
        class_doc = get_nlp()(camel_to_words(class_name))
        if not class_doc.has_vector:
            continue
        try:
            similarity = doc.similarity(class_doc)
        except ValueError:
            continue
        scored.append((similarity, class_name))

    if not scored:
        return None
    scored.sort(reverse=True)
    best_score, best_class = scored[0]
    # Seuil volontairement bas : les lemmes de la question incluent des mots
    # hors ontologie, ce qui tire la similarité vers le bas.
    if best_score >= 0.35:
        return best_class
    return None
