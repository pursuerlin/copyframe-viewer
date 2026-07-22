const openButton = document.getElementById('open-archive');
const error = document.getElementById('error');
const welcomeCard = document.querySelector('.welcome-card');
const dropHint = document.getElementById('drop-hint');

const params = new URLSearchParams(location.search);
if (params.get('error')) showError(params.get('error'));

openButton.addEventListener('click', async () => {
  if (!window.copyframeViewer?.chooseArchive) {
    showError('文件选择器未启动。请按 ⌘O，或从菜单栏选择“文件 → 打开离线网页…”。');
    return;
  }
  openButton.disabled = true;
  openButton.textContent = '正在打开…';
  try {
    const result = await window.copyframeViewer?.chooseArchive();
    if (result?.error) showError(result.error);
  } catch {
    showError('无法打开文件选择器，请从“文件”菜单重试。');
  } finally {
    openButton.disabled = false;
    openButton.textContent = '打开离线网页';
  }
});

let dragDepth = 0;
window.addEventListener('dragenter', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  welcomeCard?.classList.add('drag-active');
  if (dropHint) dropHint.textContent = '松开即可打开这个离线网页。';
});

window.addEventListener('dragover', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('dragleave', (event) => {
  if (!hasFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth) return;
  clearDropState();
});

window.addEventListener('drop', async (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  clearDropState();
  const [file] = [...(event.dataTransfer.files || [])];
  if (!file || !window.copyframeViewer?.openDroppedFile) {
    showError('无法读取拖入的文件。请按 ⌘O，或使用“文件 → 打开离线网页…”。');
    return;
  }
  openButton.disabled = true;
  openButton.textContent = '正在打开…';
  try {
    const result = await window.copyframeViewer.openDroppedFile(file);
    if (result?.error) showError(result.error);
  } catch {
    showError('无法打开拖入的文件。请确认已先解压 Copyframe 下载的 ZIP。');
  } finally {
    openButton.disabled = false;
    openButton.textContent = '打开离线网页';
  }
});

function hasFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

function clearDropState() {
  dragDepth = 0;
  welcomeCard?.classList.remove('drag-active');
  if (dropHint) dropHint.innerHTML = '也可以把解压后的文件夹或 <code>index.html</code> 直接拖到此窗口。';
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}
