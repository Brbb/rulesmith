import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankPolicy,
  createWorkspace,
  documentPolicy,
  restoreWorkspace,
  type Workspace,
} from "./workspace";
import {
  descendantFolders,
  folderPath,
  moveWorkspaceItem,
  renameWorkspaceItem,
  restoreWorkspaceItem,
  trashWorkspaceItem,
} from "./workspace-tree";
function fixture(): Workspace {
  const workspace = createWorkspace([blankPolicy("One"), blankPolicy("Two")]);
  return {
    ...workspace,
    folders: [
      ...workspace.folders,
      { id: "a", projectId: "local", name: "Team" },
      { id: "b", projectId: "local", parentId: "a", name: "Rules" },
      { id: "c", projectId: "local", parentId: "b", name: "Drafts" },
    ],
    documents: workspace.documents.map((document, index) => ({
      ...document,
      folderId: index === 0 ? "c" : "local-workflows",
      testInput: '{"score":10}',
      ...(index === 0
        ? { draft: { ...document.policy, description: "Unsaved work" } }
        : {}),
    })),
  };
}
test("nested folder moves retain descendants, file IDs, drafts and test inputs", () => {
  const workspace = fixture(),
    snapshot = JSON.stringify(workspace),
    first = workspace.documents[0];
  const moved = moveWorkspaceItem(
    workspace,
    { kind: "folder", id: "a" },
    "local-workflows",
  );
  assert.equal(folderPath(moved, "c"), "Workflows / Team / Rules / Drafts");
  assert.deepEqual([...descendantFolders(moved, "a")], ["a", "b", "c"]);
  assert.deepEqual(moved.documents[0], first);
  const fileMoved = moveWorkspaceItem(
    moved,
    { kind: "file", id: first.id },
    "",
  );
  assert.deepEqual(fileMoved.documents[0], { ...first, folderId: "" });
  assert.equal(JSON.stringify(workspace), snapshot);
  assert.deepEqual(
    restoreWorkspace(JSON.stringify(fileMoved), workspace),
    fileMoved,
  );
});
test("self, descendant, foreign-project, missing and conflicting moves fail without mutating the tree", () => {
  const workspace = fixture();
  workspace.projects.push({ id: "foreign", name: "Other" });
  workspace.folders.push({
    id: "foreign",
    projectId: "foreign",
    name: "Other",
  });
  const before = JSON.stringify(workspace);
  for (const target of ["a", "b", "c", "foreign", "missing"])
    assert.throws(() =>
      moveWorkspaceItem(workspace, { kind: "folder", id: "a" }, target),
    );
  const conflict = {
    ...workspace,
    documents: [
      ...workspace.documents,
      {
        id: "copy",
        projectId: "local",
        folderId: "b",
        policy: blankPolicy("One"),
      },
    ],
  };
  assert.throws(
    () =>
      moveWorkspaceItem(
        conflict,
        { kind: "file", id: workspace.documents[0].id },
        "b",
      ),
    /already exists/,
  );
  assert.equal(JSON.stringify(workspace), before);
});
test("renaming changes the display name without changing workflow identity or draft content", () => {
  const workspace = fixture(),
    first = workspace.documents[0];
  const renamed = renameWorkspaceItem(
    workspace,
    { kind: "file", id: first.id },
    "Renamed",
  );
  assert.equal(renamed.documents[0].id, first.id);
  assert.equal(renamed.documents[0].policy.id, first.policy.id);
  assert.equal(renamed.documents[0].policy.name, "Renamed");
  assert.equal(renamed.documents[0].draft?.name, "Renamed");
  assert.equal(renamed.documents[0].draft?.description, "Unsaved work");
  assert.equal(renamed.documents[0].testInput, first.testInput);
  assert.equal(
    folderPath(
      renameWorkspaceItem(
        workspace,
        { kind: "folder", id: "a" },
        "Renamed folder",
      ),
      "c",
    ),
    "Renamed folder / Rules / Drafts",
  );
  assert.throws(
    () =>
      renameWorkspaceItem(workspace, { kind: "folder", id: "a" }, "Workflows"),
    /already exists/,
  );
  assert.throws(
    () => renameWorkspaceItem(workspace, { kind: "file", id: first.id }, "  "),
    /Enter a name/,
  );
});
test("deleting a folder moves the whole subtree to persistent Trash and restoration preserves identities", () => {
  const workspace = fixture(),
    first = workspace.documents[0];
  const deleted = trashWorkspaceItem(workspace, { kind: "folder", id: "a" });
  assert.deepEqual(
    deleted.folders.map((folder) => folder.id),
    ["local-workflows"],
  );
  assert.equal(deleted.documents.length, 1);
  assert.equal(deleted.activeDocumentId, workspace.documents[1].id);
  assert.deepEqual(deleted.trash?.[0].documents, [first]);
  const reloaded = restoreWorkspace(JSON.stringify(deleted), workspace);
  const restored = restoreWorkspaceItem(reloaded, reloaded.trash![0].id);
  assert.equal(restored.activeDocumentId, first.id);
  assert.deepEqual(
    restored.documents.find((document) => document.id === first.id),
    first,
  );
  assert.equal(folderPath(restored, "c"), "Team / Rules / Drafts");
  assert.equal(restored.trash?.length, 0);
});
test("deleting the final file or folder leaves a valid empty workspace that stays empty after reload", () => {
  const workspace = createWorkspace([blankPolicy("Only file")]);
  const deleted = trashWorkspaceItem(workspace, {
    kind: "folder",
    id: "local-workflows",
  });
  assert.equal(deleted.documents.length, 0);
  assert.equal(deleted.folders.length, 0);
  assert.equal(deleted.activeDocumentId, "");
  const restored = restoreWorkspace(JSON.stringify(deleted), workspace);
  assert.equal(restored.documents.length, 0);
  assert.equal(restored.activeProjectId, "local");
  const recovered = restoreWorkspaceItem(restored, restored.trash![0].id);
  assert.equal(recovered.documents[0].id, workspace.documents[0].id);
  assert.equal(documentPolicy(recovered.documents[0]).name, "Only file");
});
test("restoring a file with a missing parent uses the project root and does not overwrite a reused name", () => {
  const workspace = fixture(),
    first = workspace.documents[0];
  const deleted = trashWorkspaceItem(
    trashWorkspaceItem(workspace, { kind: "file", id: first.id }),
    { kind: "folder", id: "a" },
  );
  deleted.documents.push({
    id: "replacement",
    projectId: "local",
    folderId: "",
    policy: blankPolicy("One"),
  });
  const restored = restoreWorkspaceItem(deleted, deleted.trash![0].id);
  const recovered = restored.documents.find(
    (document) => document.id === first.id,
  )!;
  assert.equal(recovered.folderId, "");
  assert.equal(documentPolicy(recovered).name, "One (restored)");
  assert.equal(
    documentPolicy(
      restored.documents.find((document) => document.id === "replacement")!,
    ).name,
    "One",
  );
});
test("reload rejects cyclic/missing-parent trees and ignores malformed Trash without discarding active work", () => {
  const workspace = fixture();
  for (const parentId of ["c", "missing"]) {
    const wrong = {
      ...workspace,
      folders: workspace.folders.map((folder) =>
        folder.id === "a" ? { ...folder, parentId } : folder,
      ),
    };
    assert.equal(restoreWorkspace(JSON.stringify(wrong), workspace), workspace);
  }
  const recovered = restoreWorkspace(
    JSON.stringify({ ...workspace, trash: [null, { id: "bad" }] }),
    workspace,
  );
  assert.deepEqual(recovered.documents, workspace.documents);
  assert.deepEqual(recovered.trash, []);
});
