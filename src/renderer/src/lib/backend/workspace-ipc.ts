import type { NodeKind, TreeNode, WorkspaceBackend, WorkspaceDirs } from '$lib/backend/types'

export const workspaceIpc: WorkspaceBackend = {
  async listWorkspaceDirs(root) {
    const listed = await window.api.listWorkspaceDirs(root)
    return listed satisfies WorkspaceDirs
  },

  async listContextTree(root, includeDirs) {
    const tree = await window.api.listContextTree(root, includeDirs)
    return tree satisfies TreeNode[]
  },

  readMarkdown(root, path) {
    return window.api.readMarkdown(root, path)
  },

  writeMarkdown(root, path, contents) {
    return window.api.writeMarkdown(root, path, contents)
  },

  createEntry(root, path, kind: NodeKind) {
    return window.api.createEntry({ root, path, kind })
  },

  renameEntry(root, from, to, kind: NodeKind) {
    return window.api.renameEntry({ root, from, to, kind })
  },

  moveEntry(root, from, to, kind: NodeKind) {
    return window.api.moveEntry({ root, from, to, kind })
  },

  deleteEntry(root, path, kind: NodeKind) {
    return window.api.deleteEntry({ root, path, kind })
  },
}
