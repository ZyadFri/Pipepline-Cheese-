"""
Domain-specific entity labels for the GLiNER local extraction engine.

Wording was iterated against real cheese-preservation papers already
processed in this project (not synthetic examples) before settling here —
label phrasing materially changes GLiNER's zero-shot recall. Two concrete
examples from that testing:
  - "ingredient or treatment" missed real ingredient names like "thyme
    essential oil"; "food ingredient or additive" caught it plus real
    preservatives (potassium sorbate, sodium benzoate, natamycin, nisin)
    and non-food actives (melittin, apamin) at 0.5-0.9 confidence.
  - "microorganism or bacteria species" reliably caught genus+species names
    (S. aureus, E. coli, Lactobacillus casei, Streptococcus sobrinus, ...)
    at 0.8-0.97 confidence — a capability the Rules engine has none of today
    (it has no microorganism lexicon or NER at all).
"""

LABELS: list[str] = [
    "cheese product",
    "food ingredient or additive",
    "concentration or dose",
    "microorganism or bacteria species",
    "microbiological indicator",
    "physicochemical indicator",
    "measurement value",
    "measurement unit",
    "storage temperature",
    "storage duration",
    "sampling day",
    "packaging",
    "processing or application method",
    "control group",
]

# Bare, information-free spans a zero-shot label will happily match literally
# (the word "cheese" itself, not a product name; "sample"/"treatment" as a
# generic noun) — filtered out in postprocess.py rather than persisted as if
# they identified something specific.
GENERIC_NOISE_TERMS = frozenset({
    "cheese", "cheeses", "milk", "sample", "samples", "product", "products",
    "treatment", "treatments", "group", "groups", "control", "batch",
})
