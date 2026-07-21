const openButton = document.getElementById('open-archive');
const error = document.getElementById('error');

const params = new URLSearchParams(location.search);
if (params.get('error')) showError(params.get('error'));

openButton.addEventListener('click', async () => {
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

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}
