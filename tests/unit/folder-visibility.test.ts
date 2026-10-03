import { describe, expect, it } from 'vitest'
import {
  FOLDER_VISIBILITY_LABEL,
  FOLDER_VISIBILITY_TOAST,
  folderName,
  includeCreatedRootFolder,
  needsFolderPicker,
  removeVisibleRootFolder,
  renameVisibleRootFolder,
  pathKeysMatch,
  shouldShowFolderVisibilityToast,
  visibilityFor,
} from '$lib/folder-visibility'

describe('pathKeysMatch', () => {
  it('treats a trailing slash as the same folder', () => {
    expect(pathKeysMatch('/tmp/idioteque', '/tmp/idioteque/')).toBe(true)
    expect(pathKeysMatch('/tmp/idioteque', '/tmp/other')).toBe(false)
  })
})

describe('folderName', () => {
  it('uses the last path segment', () => {
    expect(folderName('/home/user/idioteque')).toBe('idioteque')
    expect(folderName('/home/user/.cursor/')).toBe('.cursor')
  })
})

describe('visibilityFor', () => {
  const views = [
    { path: '/tmp/idioteque', visibleFolders: ['.cursor', 'src'] },
    { path: '/tmp/docs', visibleFolders: [] },
  ]

  it('returns the saved folders for a matching path', () => {
    expect(visibilityFor(views, '/tmp/idioteque/')).toEqual(['.cursor', 'src'])
    expect(visibilityFor(views, '/tmp/docs')).toEqual([])
  })

  it('is undefined when that folder was never configured', () => {
    expect(visibilityFor(views, '/tmp/other')).toBeUndefined()
    expect(visibilityFor([], '/tmp/idioteque')).toBeUndefined()
  })
})

describe('needsFolderPicker', () => {
  it('asks only when there are subfolders and no saved view', () => {
    expect(needsFolderPicker(['src', 'docs'], undefined)).toBe(true)
    expect(needsFolderPicker(['src'], [])).toBe(false)
    expect(needsFolderPicker(['src'], ['src'])).toBe(false)
    expect(needsFolderPicker([], undefined)).toBe(false)
  })
})

describe('shouldShowFolderVisibilityToast', () => {
  it('hints only for unconfigured folders that have subdirs', () => {
    expect(shouldShowFolderVisibilityToast(true, undefined)).toBe(true)
    expect(shouldShowFolderVisibilityToast(true, [])).toBe(false)
    expect(shouldShowFolderVisibilityToast(true, ['src'])).toBe(false)
    expect(shouldShowFolderVisibilityToast(false, undefined)).toBe(false)
  })
})

describe('includeCreatedRootFolder', () => {
  it('adds a root folder to an active filter', () => {
    expect(includeCreatedRootFolder(['src'], '', 'notas')).toEqual(['src', 'notas'])
    expect(includeCreatedRootFolder([], '', 'notas')).toEqual(['notas'])
  })

  it('leaves nested creates and an unfiltered tree alone', () => {
    expect(includeCreatedRootFolder(['src'], 'src', 'lib')).toEqual(['src'])
    expect(includeCreatedRootFolder(null, '', 'notas')).toBeNull()
    expect(includeCreatedRootFolder(['src'], '', 'src')).toEqual(['src'])
  })
})

describe('renameVisibleRootFolder', () => {
  it('renames a root folder inside an active filter', () => {
    expect(renameVisibleRootFolder(['src', 'docs'], 'docs', 'notas')).toEqual(['src', 'notas'])
  })

  it('leaves an unfiltered tree and unknown names alone', () => {
    expect(renameVisibleRootFolder(null, 'docs', 'notas')).toBeNull()
    expect(renameVisibleRootFolder(['src'], 'docs', 'notas')).toEqual(['src'])
  })
})

describe('removeVisibleRootFolder', () => {
  it('drops a deleted root folder from the filter', () => {
    expect(removeVisibleRootFolder(['src', 'docs'], 'docs')).toEqual(['src'])
    expect(removeVisibleRootFolder(['docs'], 'docs')).toEqual([])
  })

  it('leaves an unfiltered tree alone', () => {
    expect(removeVisibleRootFolder(null, 'docs')).toBeNull()
  })
})

describe('copy', () => {
  it('names the control Carpetas visibles', () => {
    expect(FOLDER_VISIBILITY_LABEL).toBe('Carpetas visibles')
    expect(FOLDER_VISIBILITY_TOAST).toContain('Carpetas visibles')
    expect(FOLDER_VISIBILITY_TOAST).toContain('carpeta con +')
  })
})
