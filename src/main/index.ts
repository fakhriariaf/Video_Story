import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { closeDb, getDb } from './db'
import { attachDevHarness, prepareHarness } from './devharness'
import { resumeJobs } from './generation'
import { registerIpc } from './ipc'
import { handleStudioProtocol, registerSchemes } from './protocol'
import { warmUpEncryption } from './secrets'

/** Projects, database and saved keys live in their own folder, so dev runs can point elsewhere. */
function useDataFolder(): void {
  if (!app.isPackaged && process.env.STUDIO_USER_DATA) return app.setPath('userData', process.env.STUDIO_USER_DATA)
  app.setPath('userData', join(app.getPath('appData'), 'Video Story'))
}

useDataFolder()
prepareHarness()
// Windows hands videos to hardware overlays that snap their size and position to whole pixels, so a slow
// camera move over a video trembles while the same move over a still is smooth. Draw videos like images.
app.commandLine.appendSwitch('disable-direct-composition-video-overlays')

registerSchemes()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#121026',
    autoHideMenuBar: true,
    title: 'Video Story',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())
  attachDevHarness(win)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? 'file://')) e.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const single = app.requestSingleInstanceLock()
if (!single) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })

  void app.whenReady().then(() => {
    app.setAppUserModelId('id.fakhriariaf.videostory')
    warmUpEncryption()
    getDb()
    handleStudioProtocol()
    registerIpc()
    createWindow()
    resumeJobs()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => closeDb())
}
