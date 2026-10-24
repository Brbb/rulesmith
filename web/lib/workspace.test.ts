import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankPolicy,
  createWorkspace,
  documentPolicy,
  editDocument,
  restoreWorkspace,
} from "./workspace";
test("migration preserves the last saved policy instead of replacing it with its sample", () => {
  const sample = blankPolicy("Sample"),
    saved = { ...sample, name: "My changes" };
  const workspace = createWorkspace([sample], saved);
  assert.equal(workspace.documents.length, 1);
  assert.equal(documentPolicy(workspace.documents[0]).name, "My changes");
  assert.equal(workspace.activeDocumentId, workspace.documents[0].id);
  const custom = blankPolicy("Custom");
  assert.equal(createWorkspace([sample], custom).documents.length, 2);
});
test("file drafts survive reload and saving one file does not overwrite another", () => {
  const workspace = createWorkspace([blankPolicy("One"), blankPolicy("Two")]);
  const first = workspace.documents[0],
    second = workspace.documents[1];
  const edited = { ...first.policy, name: "Edited one" };
  const draft = editDocument(workspace, first.id, edited);
  assert.equal(draft.documents[0].policy.name, "One");
  assert.equal(documentPolicy(draft.documents[0]).name, "Edited one");
  const restored = restoreWorkspace(JSON.stringify(draft), workspace);
  assert.equal(documentPolicy(restored.documents[0]).name, "Edited one");
  const saved = editDocument(restored, first.id, edited, true);
  assert.equal(saved.documents[0].draft, undefined);
  assert.equal(saved.documents[0].policy.name, "Edited one");
  assert.deepEqual(saved.documents[1], second);
  assert.equal(workspace.documents[0].policy.name, "One");
});
test("invalid workspace references or duplicate IDs fall back safely; a missing active selection is repaired", () => {
  const workspace = createWorkspace([blankPolicy("One")]);
  assert.equal(restoreWorkspace("invalid", workspace), workspace);
  const wrongFolder = {
    ...workspace,
    documents: [{ ...workspace.documents[0], folderId: "missing" }],
  };
  assert.equal(
    restoreWorkspace(JSON.stringify(wrongFolder), workspace),
    workspace,
  );
  const duplicate = {
    ...workspace,
    documents: [workspace.documents[0], workspace.documents[0]],
  };
  assert.equal(
    restoreWorkspace(JSON.stringify(duplicate), workspace),
    workspace,
  );
  const repaired = restoreWorkspace(
    JSON.stringify({ ...workspace, activeDocumentId: "missing" }),
    workspace,
  );
  assert.equal(repaired.activeDocumentId, workspace.documents[0].id);
});

test("legacy file categories consolidate without changing file identity or local data", () => {
  const fallback = createWorkspace([blankPolicy("One"), blankPolicy("Two")]);
  const first = {
    ...fallback.documents[0],
    folderId: "local-policies",
    draft: { ...fallback.documents[0].policy, name: "Draft" },
    testInput: '{"age":26}',
  };
  const customFolder = {
    id: "custom",
    projectId: "local",
    name: "Policies",
    kind: "policy" as const,
  };
  const legacy = {
    ...fallback,
    folders: [
      ...fallback.folders,
      {
        id: "local-policies",
        projectId: "local",
        name: "Policies",
        kind: "policy",
      },
      customFolder,
    ],
    documents: [first, { ...fallback.documents[1], folderId: customFolder.id }],
    activeDocumentId: first.id,
  };
  const restored = restoreWorkspace(JSON.stringify(legacy), fallback);
  assert.deepEqual(restored.documents[0], {
    ...first,
    folderId: "local-workflows",
  });
  assert.equal(restored.activeDocumentId, first.id);
  assert.deepEqual(restored.folders, [...fallback.folders, customFolder]);
  assert.deepEqual(restored.documents[1], legacy.documents[1]);
  assert.deepEqual(
    restoreWorkspace(JSON.stringify(restored), fallback),
    restored,
  );
});
test("folders do not impose a separate policy or workflow file type", () => {
  const workspace = createWorkspace([blankPolicy("One")]);
  assert.equal(workspace.folders.length, 1);
  const generic = {
    ...workspace,
    folders: [{ id: "local-workflows", projectId: "local", name: "Rules" }],
  };
  assert.deepEqual(
    restoreWorkspace(JSON.stringify(generic), workspace),
    generic,
  );
});
