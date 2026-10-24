import {
  documentPolicy,
  type TrashEntry,
  type Workspace,
  type WorkspaceFolder,
  type WorkspaceItem,
} from "./workspace";
export function descendantFolders(
  workspace: Workspace,
  id: string,
): Set<string> {
  const ids = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const folder of workspace.folders)
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
  }
  return ids;
}
export function folderPath(workspace: Workspace, id: string): string {
  const names: string[] = [],
    seen = new Set<string>();
  let folder = workspace.folders.find((item) => item.id === id);
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    names.unshift(folder.name);
    folder = workspace.folders.find((item) => item.id === folder?.parentId);
  }
  return names.join(" / ");
}
function locate(workspace: Workspace, item: WorkspaceItem) {
  const value =
    item.kind === "folder"
      ? workspace.folders.find((folder) => folder.id === item.id)
      : workspace.documents.find((document) => document.id === item.id);
  if (!value) throw new Error("This item no longer exists.");
  return {
    value,
    projectId: value.projectId,
    parentId:
      item.kind === "folder"
        ? (value as WorkspaceFolder).parentId || ""
        : (value as Workspace["documents"][number]).folderId,
    name:
      item.kind === "folder"
        ? (value as WorkspaceFolder).name
        : documentPolicy(value as Workspace["documents"][number]).name,
  };
}
export function assertWorkspaceName(
  workspace: Workspace,
  projectId: string,
  parentId: string,
  name: string,
  except?: WorkspaceItem,
) {
  if (!name.trim()) throw new Error("Enter a name.");
  if (
    workspace.folders.some(
      (folder) =>
        folder.projectId === projectId &&
        (folder.parentId || "") === parentId &&
        folder.name === name.trim() &&
        !(except?.kind === "folder" && except.id === folder.id),
    ) ||
    workspace.documents.some(
      (document) =>
        document.projectId === projectId &&
        document.folderId === parentId &&
        documentPolicy(document).name === name.trim() &&
        !(except?.kind === "file" && except.id === document.id),
    )
  )
    throw new Error("An item with that name already exists here.");
}
export function renameWorkspaceItem(
  workspace: Workspace,
  item: WorkspaceItem,
  name: string,
): Workspace {
  const source = locate(workspace, item);
  name = name.trim();
  assertWorkspaceName(workspace, source.projectId, source.parentId, name, item);
  return item.kind === "folder"
    ? {
        ...workspace,
        folders: workspace.folders.map((folder) =>
          folder.id === item.id ? { ...folder, name } : folder,
        ),
      }
    : {
        ...workspace,
        documents: workspace.documents.map((document) =>
          document.id === item.id
            ? {
                ...document,
                policy: { ...document.policy, name },
                ...(document.draft
                  ? { draft: { ...document.draft, name } }
                  : {}),
              }
            : document,
        ),
      };
}
export function moveWorkspaceItem(
  workspace: Workspace,
  item: WorkspaceItem,
  parentId: string,
): Workspace {
  const source = locate(workspace, item),
    target = workspace.folders.find((folder) => folder.id === parentId);
  if (parentId && (!target || target.projectId !== source.projectId))
    throw new Error("Choose a folder in the same project.");
  if (
    item.kind === "folder" &&
    descendantFolders(workspace, item.id).has(parentId)
  )
    throw new Error("A folder cannot be moved into itself or a subfolder.");
  assertWorkspaceName(workspace, source.projectId, parentId, source.name, item);
  return item.kind === "folder"
    ? {
        ...workspace,
        folders: workspace.folders.map((folder) =>
          folder.id === item.id
            ? { ...folder, parentId: parentId || undefined }
            : folder,
        ),
      }
    : {
        ...workspace,
        documents: workspace.documents.map((document) =>
          document.id === item.id
            ? { ...document, folderId: parentId }
            : document,
        ),
      };
}
export function trashWorkspaceItem(
  workspace: Workspace,
  item: WorkspaceItem,
): Workspace {
  const source = locate(workspace, item),
    ids =
      item.kind === "folder"
        ? descendantFolders(workspace, item.id)
        : new Set<string>();
  const folders = workspace.folders.filter((folder) => ids.has(folder.id));
  const documents = workspace.documents.filter((document) =>
    item.kind === "file" ? document.id === item.id : ids.has(document.folderId),
  );
  const remaining = workspace.documents.filter(
    (document) => !documents.includes(document),
  );
  const next =
    remaining.find((document) => document.id === workspace.activeDocumentId) ||
    remaining.find((document) => document.projectId === source.projectId) ||
    remaining[0];
  const entry: TrashEntry = {
    id: crypto.randomUUID(),
    item,
    label: source.name,
    projectId: source.projectId,
    deletedAt: new Date().toISOString(),
    folders,
    documents,
  };
  return {
    ...workspace,
    folders: workspace.folders.filter((folder) => !ids.has(folder.id)),
    documents: remaining,
    activeDocumentId: next?.id || "",
    activeProjectId: next?.projectId || source.projectId,
    trash: [...(workspace.trash || []), entry],
  };
}
export function restoreWorkspaceItem(
  workspace: Workspace,
  trashId: string,
): Workspace {
  const entry = workspace.trash?.find((entry) => entry.id === trashId);
  if (
    !entry ||
    !workspace.projects.some((project) => project.id === entry.projectId)
  )
    throw new Error("This deleted item cannot be found.");
  if (
    entry.folders.some((folder) =>
      workspace.folders.some((current) => current.id === folder.id),
    ) ||
    entry.documents.some((document) =>
      workspace.documents.some((current) => current.id === document.id),
    )
  )
    throw new Error("An item with the same identity already exists.");
  const ids = new Set(
    [...workspace.folders, ...entry.folders].map((folder) => folder.id),
  );
  const folders = entry.folders.map((folder) => ({
    ...folder,
    ...(folder.parentId && !ids.has(folder.parentId)
      ? { parentId: undefined }
      : {}),
  }));
  const documents = entry.documents.map((document) => ({
    ...document,
    folderId: ids.has(document.folderId) ? document.folderId : "",
  }));
  let next = {
    ...workspace,
    folders: [...workspace.folders, ...folders],
    documents: [...workspace.documents, ...documents],
  };
  // Keep both items if another file or folder took the original name while it was in Trash.
  for (const item of [
    ...folders.map((folder) => ({ kind: "folder" as const, id: folder.id })),
    ...documents.map((document) => ({
      kind: "file" as const,
      id: document.id,
    })),
  ]) {
    const source = locate(next, item);
    let name = source.name,
      index = 1;
    for (;;) {
      try {
        assertWorkspaceName(
          next,
          source.projectId,
          source.parentId,
          name,
          item,
        );
        break;
      } catch {
        name = `${source.name} (restored${index === 1 ? "" : ` ${index}`})`;
        index++;
      }
    }
    if (name !== source.name) next = renameWorkspaceItem(next, item, name);
  }
  return {
    ...next,
    activeDocumentId: documents[0]?.id || workspace.activeDocumentId,
    activeProjectId:
      documents[0]?.projectId || workspace.activeProjectId || entry.projectId,
    trash: workspace.trash!.filter((item) => item.id !== trashId),
  };
}
