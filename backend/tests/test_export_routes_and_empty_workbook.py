"""
Regression tests for two real bugs a live-browser verification pass found
in the Export page's "recent exports" feature:

1. GET /snapshots/exports was shadowed by GET /snapshots/{snapshot_id} -
   Starlette matches routes in declaration order, and the parameterized
   route was declared first, so "/exports" got matched against
   {snapshot_id}: int and failed int-coercion -> 422 on every call.
2. Building an Excel export for a project with no canonical data yet wrote
   zero sheets, and openpyxl raises "At least one sheet must be visible"
   for a workbook with none - a legitimate empty project could never
   produce a completed export run.
"""
import openpyxl

from app.db.models import Project
from app.services.exporter import _build_excel


def test_list_exports_route_is_not_shadowed_by_snapshot_id_route(
    client, auth_headers, db, test_user,
):
    project = Project(name="Empty Project", owner_id=test_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)

    resp = client.get(
        f"/api/snapshots/exports?project_id={project.id}", headers=auth_headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_snapshot_by_id_route_still_works(client, auth_headers, db, test_user):
    project = Project(name="Empty Project", owner_id=test_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)

    resp = client.post(
        "/api/snapshots",
        json={"project_id": project.id, "label": "Test snapshot"},
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    snap_id = resp.json()["id"]

    resp2 = client.get(f"/api/snapshots/{snap_id}", headers=auth_headers)
    assert resp2.status_code == 200
    assert resp2.json()["id"] == snap_id


def test_build_excel_for_empty_project_does_not_raise(db, test_user, tmp_path, monkeypatch):
    from app.services import exporter

    monkeypatch.setattr(exporter, "EXPORT_DIR", tmp_path)

    project = Project(name="Empty Project", owner_id=test_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)

    path = _build_excel(project.id, 999, db)
    assert path.exists()

    wb = openpyxl.load_workbook(str(path))
    assert wb.sheetnames == ["Info"]
    assert wb["Info"].sheet_state == "visible"
