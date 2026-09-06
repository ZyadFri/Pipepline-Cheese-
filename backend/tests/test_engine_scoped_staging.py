"""
Confirms LLM and Rules staging data coexist for the same paper instead of one
engine's run wiping the other's — the core requirement that makes independent
comparison possible (spec §28-30). Runs a mocked LLM extraction, then a real
rule extraction, on the same paper, and asserts both engines' ExtExperiment/
ExtMeasurement rows are still present afterward; then re-runs the LLM
extraction and confirms only its own rows were replaced.
"""
import shutil
from pathlib import Path

from app.api.routes import extraction_workspace
from app.db.models import AssetContextLink, ExtExperiment, ExtractionAsset, Job, Paper, Project
from app.extraction.common.persist import persist_paper_extraction
from app.extraction.rules.engine import RuleExtractionEngine

FIXTURE_CSV = Path(__file__).parent / "fixtures" / "sample_table.csv"


class _NonClosingSession:
    def __init__(self, real):
        self._real = real

    def __getattr__(self, name):
        return getattr(self._real, name)

    def close(self):
        pass


FAKE_LLM_RESULT = {
    "reasoning_summary": "LLM run",
    "experiments": [
        {
            "cheese_product": "Cheddar", "treatment": "control",
            "experiment_evidence": [], "ingredients": [],
            "measurements": [
                {"day": 0, "indicator_type": "Total viable count", "indicator_unit": "log CFU/g",
                 "indicator_threshold": None, "indicator_value": 3.1,
                 "value_is_approximate": False, "evidence": []},
            ],
        },
    ],
    "low_confidence_count": 0,
}


def _seed(db, user, tmp_path):
    project = Project(name="Staging Isolation Test", owner_id=user.id)
    db.add(project)
    db.flush()
    paper = Paper(project_id=project.id, filename="p.pdf", original_name="paper.pdf",
                  file_path="/nonexistent/p.pdf", page_count=5, status="uploaded")
    db.add(paper)
    db.flush()

    csv_path = tmp_path / "table_0.csv"
    shutil.copy(FIXTURE_CSV, csv_path)
    asset = ExtractionAsset(
        paper_id=paper.id, project_id=project.id, docling_item_ref="#/tables/0",
        asset_type="native_table", page_number=3, classification="native_table",
        caption="Yeasts and molds in Gouda cheese stored at 4°C",
        csv_path=str(csv_path), csv_rows=2, csv_cols=4,
        relevance_score=5.0, selected_for_llm=True,
    )
    db.add(asset)
    db.flush()
    db.add(AssetContextLink(asset_id=asset.id, link_type="same_section", page_number=3,
                             item_ref="#/texts/0", text="Gouda cheese stored at 4C.", score=1.0))
    job = Job(project_id=project.id, paper_id=paper.id, job_type="llm_validation",
              status="queued", created_by=user.id)
    db.add(job)
    db.commit()
    db.refresh(paper)
    db.refresh(job)
    return project, paper, job


def test_llm_and_rules_staging_coexist_for_same_paper(db, test_user, tmp_path, monkeypatch):
    project, paper, job = _seed(db, test_user, tmp_path)

    # Run (mocked) LLM extraction first.
    monkeypatch.setattr(extraction_workspace, "SessionLocal", lambda: _NonClosingSession(db))
    monkeypatch.setattr(extraction_workspace, "extract_food_data", lambda **kw: FAKE_LLM_RESULT)
    extraction_workspace._run_llm_validation(paper.id, project.id, job.id)

    llm_experiments = db.query(ExtExperiment).filter(
        ExtExperiment.paper_id == paper.id, ExtExperiment.engine == "llm",
    ).all()
    assert len(llm_experiments) == 1
    assert llm_experiments[0].cheese_product == "Cheddar"

    # Now run the real rule engine on the same paper.
    rule_result = RuleExtractionEngine().extract_document(paper.id, project.id, db)
    persist_paper_extraction(rule_result, paper=paper, project_id=project.id, job_id=None, engine="rules", db=db)

    # Both engines' staging rows must still be present, independently.
    llm_experiments_after = db.query(ExtExperiment).filter(
        ExtExperiment.paper_id == paper.id, ExtExperiment.engine == "llm",
    ).all()
    rule_experiments = db.query(ExtExperiment).filter(
        ExtExperiment.paper_id == paper.id, ExtExperiment.engine == "rules",
    ).all()
    assert len(llm_experiments_after) == 1, "rule extraction must not touch the LLM's staging rows"
    assert llm_experiments_after[0].cheese_product == "Cheddar"
    assert len(rule_experiments) == 2  # Control + EO 0.5% from the table

    # Re-running LLM extraction again must only replace ITS OWN rows, leaving
    # the rule engine's rows untouched.
    job2 = Job(project_id=project.id, paper_id=paper.id, job_type="llm_validation",
               status="queued", created_by=test_user.id)
    db.add(job2)
    db.commit()
    db.refresh(job2)
    extraction_workspace._run_llm_validation(paper.id, project.id, job2.id)

    rule_experiments_after = db.query(ExtExperiment).filter(
        ExtExperiment.paper_id == paper.id, ExtExperiment.engine == "rules",
    ).all()
    assert len(rule_experiments_after) == 2, "re-running LLM extraction must not touch the rule engine's staging rows"
