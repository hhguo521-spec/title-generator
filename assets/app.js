(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const views = $$('.view');
  const nav = $('#nav');
  const toastEl = $('#toast');
  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? window.location.origin
    : 'https://xiaodian-shangpin-chuangzuo.smartjam12.chatgpt.site';
  let step = 1;
  let uploadedImage = '';
  let loadedProductImage = null;
  let loadedImageSource = '';
  let selectedFact = '';
  let selectedVersion = 0;
  let headlineVersion = 0;
  let aiConfigured = false;
  let aiChoices = [];

  const data = {
    name: '', category: '', audience: '', facts: '', headline: '',
    subheadline: '', theme: 'warm', image: ''
  };
  let folderHandle = null;
  let folderDbPromise = null;

  function folderDb() {
    if (folderDbPromise) return folderDbPromise;
    folderDbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('当前浏览器不支持本机文件夹设置'));
      const request = indexedDB.open('guodawang-local-files', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法读取本机文件夹设置'));
    });
    return folderDbPromise;
  }

  async function storedFolderHandle() {
    const db = await folderDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get('dataFolder');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('无法读取已保存的文件夹'));
    });
  }

  async function storeFolderHandle(handle) {
    const db = await folderDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction('settings', 'readwrite').objectStore('settings').put(handle, 'dataFolder');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('无法保存文件夹设置'));
    });
  }

  function setFolderStatus(message) {
    const status = $('#folderStatus');
    if (status) status.textContent = message;
  }

  async function restoreFolderHandle() {
    if (!('showDirectoryPicker' in window)) {
      setFolderStatus('当前浏览器不支持直接保存到文件夹，可继续下载 PNG。');
      return;
    }
    try {
      folderHandle = await storedFolderHandle();
      if (!folderHandle) return;
      const permission = await folderHandle.queryPermission({ mode: 'readwrite' });
      setFolderStatus(permission === 'granted'
        ? `已连接「${folderHandle.name}」，保存时会写入此文件夹。`
        : `已记住「${folderHandle.name}」，点击下方按钮重新授权。`);
      $('#chooseFolder').textContent = permission === 'granted' ? '更换文件夹' : '重新授权文件夹';
    } catch {
      setFolderStatus('未连接文件夹，记录会暂存在当前浏览器。');
    }
  }

  async function chooseDataFolder() {
    if (!('showDirectoryPicker' in window)) {
      toast('当前浏览器不支持直接保存到文件夹，可下载后手动归档');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: 'guodawang-product-data', mode: 'readwrite' });
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        toast('需要允许文件夹访问，才能直接保存商品资料');
        return;
      }
      folderHandle = handle;
      await storeFolderHandle(handle);
      setFolderStatus(`已连接「${handle.name}」，商品记录、原图和导出主图会分类保存。`);
      $('#chooseFolder').textContent = '更换文件夹';
      toast(`已连接文件夹：${handle.name}`);
    } catch (error) {
      if (error.name !== 'AbortError') toast(error.message || '连接文件夹失败');
    }
  }

  async function ensureFolderAccess() {
    if (!folderHandle) return false;
    try {
      let permission = await folderHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') permission = await folderHandle.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') return true;
      setFolderStatus(`尚未获得「${folderHandle.name}」的写入授权。`);
      return false;
    } catch {
      setFolderStatus('无法访问已连接的文件夹，请重新选择。');
      return false;
    }
  }

  function safeFileName(value) {
    return (value || '未命名商品').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').slice(0, 60);
  }

  function dataUrlToBlob(dataUrl) {
    if (!dataUrl) return null;
    const [header, content] = dataUrl.split(',');
    const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  }

  async function writeFolderFile(directoryName, fileName, blob) {
    if (!folderHandle || !blob) return false;
    const directory = await folderHandle.getDirectoryHandle(directoryName, { create: true });
    const file = await directory.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }

  $('#chooseFolder').addEventListener('click', chooseDataFolder);
  restoreFolderHandle();

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2300);
  }

  function show(view) {
    views.forEach(node => node.classList.toggle('active', node.id === `view-${view}`));
    $$('.nav [data-view]').forEach(node => node.classList.toggle('active', node.dataset.view === view));
    nav.classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'account') updateAccount();
    if (view === 'library') renderSaved();
    if (view === 'ai-settings') refreshAiConfig();
    if (view === 'image-tool') renderMainImage();
  }

  $$('[data-view]').forEach(node => node.addEventListener('click', () => show(node.dataset.view)));
  $$('[data-scroll]').forEach(node => node.addEventListener('click', () => {
    document.getElementById(node.dataset.scroll).scrollIntoView({ behavior: 'smooth' });
  }));
  $('#menuToggle').addEventListener('click', () => nav.classList.toggle('open'));

  function setStep(next) {
    step = next;
    $$('.step-content').forEach(node => node.classList.toggle('active', Number(node.dataset.step) === next));
    $$('.progress-step').forEach(node => {
      const number = Number(node.dataset.stepLabel);
      node.classList.toggle('active', number === next);
      node.classList.toggle('done', number < next);
      $('.dot', node).textContent = number < next ? '✓' : number;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startDemo() {
    $('#productName').value = '婴儿柔软棉柔巾';
    $('#category').value = '母婴用品';
    $('#audience').value = '新手爸妈';
    $('#productFacts').value = '柔软棉柔巾\n抽取式包装\n规格：80 抽/包';
    setStep(1);
    show('workspace');
    toast('示例资料已填入，可以修改后继续');
  }
  $('#demoStart').addEventListener('click', startDemo);
  $('#loadExample').addEventListener('click', startDemo);

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('无法识别这张图片'));
        image.onload = () => {
          const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', .82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  $('#imageFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    $('#imageFileName').textContent = file.name;
    try {
      uploadedImage = await resizeImage(file);
      data.image = uploadedImage;
      showUploadedImage(uploadedImage);
      toast('商品实拍已载入，可预览和导出主图');
    } catch (error) {
      toast(error.message || '图片读取失败，请换一张图片');
    }
  });

  function showUploadedImage(source) {
    if (source === loadedImageSource && loadedProductImage) {
      renderMainImage();
      return;
    }
    loadedImageSource = source || '';
    loadedProductImage = null;
    if (!source) {
      renderMainImage();
      return;
    }
    const photo = new Image();
    photo.onload = () => {
      if (loadedImageSource !== source) return;
      loadedProductImage = photo;
      renderMainImage();
    };
    photo.onerror = () => {
      loadedImageSource = '';
      toast('商品照片无法读取，请重新上传原图');
      renderMainImage();
    };
    photo.src = source;
  }

  function splitFacts(text) {
    const seen = new Set();
    return text.split(/[\n\r；;。]/)
      .map(part => part.replace(/^[\s，、•·\-]+|[\s，、•·\-]+$/g, '').trim())
      .filter(part => part.length >= 2 && !/^(示例资料|商品信息|特点)[:：]?$/u.test(part))
      .filter(part => {
        const key = part.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function sellingCopy(fact, version = 0) {
    const name = data.name || '这款商品';
    const audience = data.audience.trim();
    let title;
    if (version === 0) title = `${fact}，${name}特点清楚呈现`;
    else if (version === 1) title = `选${name}，先了解「${fact}」`;
    else title = `关于${name}，这项特点值得看`;
    const subtitle = version === 1 && audience
      ? `${audience}可查看：${fact}`
      : `${name}｜${fact}（按已确认商品资料整理）`;
    return { title, subtitle };
  }

  function renderSellingOptions(facts) {
    const container = $('#sellingOptions');
    container.replaceChildren();
    const candidates = facts.slice(0, 3);
    if (candidates.length === 1) candidates.push(candidates[0], candidates[0]);
    else if (candidates.length === 2) candidates.push(candidates[1]);
    candidates.forEach((fact, index) => {
      const card = document.createElement('label');
      card.className = `option-card${index === 0 ? ' selected' : ''}`;
      const radio = document.createElement('span');
      radio.className = 'radio';
      const copy = document.createElement('span');
      const title = document.createElement('b');
      title.textContent = index === 0 ? `突出「${fact}」` : index === 1 ? `围绕「${fact}」来表达` : `把「${fact}」讲清楚`;
      const desc = document.createElement('p');
      desc.textContent = `依据：你确认的商品资料“${fact}”。建议发布前核对商品实物。`;
      copy.append(title, desc);
      card.append(radio, copy);
      card.dataset.fact = fact;
      card.dataset.version = index;
      container.append(card);
    });
    selectedFact = candidates[0];
    selectedVersion = 0;
    applySellingCopy();
  }

  function applySellingCopy() {
    const custom = $('#customSelling').value.trim();
    const fact = custom || selectedFact;
    if (!fact) return;
    const result = sellingCopy(fact, headlineVersion % 3);
    $('#headline').value = result.title;
    $('#subheadline').value = result.subtitle;
  }

  $('#toStep2').addEventListener('click', () => {
    const name = $('#productName').value.trim();
    if (!name) {
      toast('请先填写商品名称');
      $('#productName').focus();
      return;
    }
    data.name = name;
    data.category = $('#category').value;
    data.audience = $('#audience').value.trim();
    data.facts = $('#productFacts').value.trim();
    const facts = splitFacts(data.facts);
    $('#confirmedFacts').value = facts.join('\n');
    $('#workspaceTitle').textContent = `${name} · 商品素材`;
    setStep(2);
  });

  $('#toStep3').addEventListener('click', () => {
    const facts = splitFacts($('#confirmedFacts').value.trim());
    if (!facts.length) {
      toast('请补充至少一项已确认的商品特点或规格');
      $('#confirmedFacts').focus();
      return;
    }
    data.facts = facts.join('\n');
    renderSellingOptions(facts);
    setStep(3);
  });

  $$('[data-back]').forEach(button => button.addEventListener('click', () => setStep(Number(button.dataset.back))));
  $('#sellingOptions').addEventListener('click', event => {
    const card = event.target.closest('.option-card');
    if (!card) return;
    $$('.option-card', $('#sellingOptions')).forEach(item => item.classList.toggle('selected', item === card));
    selectedFact = card.dataset.fact;
    selectedVersion = Number(card.dataset.version);
    headlineVersion = selectedVersion;
    $('#customSelling').value = '';
    if (card.dataset.headline && card.dataset.subtitle) {
      $('#headline').value = card.dataset.headline;
      $('#subheadline').value = card.dataset.subtitle;
    } else {
      applySellingCopy();
    }
  });
  $('#customSelling').addEventListener('input', () => applySellingCopy());
  $('#regenCopy').addEventListener('click', () => generateAiCopy());
  $('#generateAiCopy').addEventListener('click', () => generateAiCopy());

  async function apiRequest(path, payload) {
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: payload === undefined ? 'GET' : 'POST',
        headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        cache: 'no-store'
      });
    } catch {
      throw new Error('无法连接标题生成服务，请检查网络后重试。');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || `请求失败（${response.status}）`);
      error.needsConfig = Boolean(result.needs_config);
      throw error;
    }
    return result;
  }

  async function refreshAiConfig() {
    try {
      const config = await apiRequest('/api/config');
      aiConfigured = config.configured;
      $('#apiKeyHint').textContent = aiConfigured
        ? `服务已连接${config.model ? ` · ${config.model}` : ''}。密钥仅保存在服务端。`
        : '服务端尚未配置 API Key，请网站管理员在后端 Secret 中添加 DEEPSEEK_API_KEY。';
      $('#configStatus').textContent = aiConfigured ? '● 已配置' : '○ 尚未配置';
      $('#configStatus').classList.toggle('is-ready', aiConfigured);
      $('#aiGenerationStatus').textContent = aiConfigured ? 'DeepSeek 已就绪' : '需要先配置 DeepSeek';
      $('#aiGenerationStatus').classList.toggle('is-ready', aiConfigured);
    } catch (error) {
      $('#configStatus').textContent = 'AI 服务暂不可用';
      $('#aiGenerationStatus').textContent = 'AI 服务暂不可用';
      $('#apiKeyHint').textContent = error.message;
    }
  }

  async function generateAiCopy() {
    const status = $('#aiGenerationStatus');
    const button = $('#generateAiCopy');
    if (!aiConfigured) {
      show('ai-settings');
      toast('标题生成服务尚未配置，请联系网站管理员');
      return;
    }
    if (!data.name || !$('#confirmedFacts').value.trim()) {
      toast('请先完成商品资料，并确认至少一项商品信息');
      return;
    }
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = '正在生成…';
    status.textContent = '正在根据已确认资料生成，请稍候…';
    try {
      const result = await apiRequest('/api/generate', {
        name: data.name,
        category: data.category,
        audience: data.audience,
        facts: $('#confirmedFacts').value.trim(),
        custom_selling: $('#customSelling').value.trim()
      });
      aiChoices = result.selling_points;
      const container = $('#sellingOptions');
      container.replaceChildren();
      aiChoices.forEach((choice, index) => {
        const card = document.createElement('label');
        card.className = `option-card${index === 0 ? ' selected' : ''}`;
        card.dataset.version = String(index);
        card.dataset.fact = choice.point;
        card.dataset.headline = choice.headline;
        card.dataset.subtitle = choice.subtitle;
        const radio = document.createElement('span');
        radio.className = 'radio';
        const copy = document.createElement('span');
        const title = document.createElement('b');
        title.textContent = choice.point;
        const desc = document.createElement('p');
        desc.textContent = `依据：${choice.basis || '请结合商品实物和资料核实。'}`;
        copy.append(title, desc);
        card.append(radio, copy);
        container.append(card);
      });
      selectedFact = aiChoices[0].point;
      selectedVersion = 0;
      headlineVersion = 0;
      $('#customSelling').value = '';
      $('#headline').value = aiChoices[0].headline;
      $('#subheadline').value = aiChoices[0].subtitle;
      status.textContent = '已由 DeepSeek 生成 · 请核对商品事实';
      status.classList.add('is-ready');
      toast('DeepSeek 已生成卖点和标题方案');
    } catch (error) {
      status.textContent = error.message;
      if (error.needsConfig) {
        aiConfigured = false;
        show('ai-settings');
      }
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  /*
  $('#regenCopy').addEventListener('click', () => {
    headlineVersion += 1;
    applySellingCopy();
    toast('已根据当前商品资料换一种表达');
  });
  */
  $('#shortenCopy').addEventListener('click', () => {
    const fact = $('#customSelling').value.trim() || selectedFact;
    $('#headline').value = `${fact.slice(0, 14)} · ${data.name}`;
    toast('已生成简短标题');
  });

  function syncPreview() {
    renderMainImage();
  }

  $('#toImageTool').addEventListener('click', () => {
    data.headline = $('#headline').value.trim();
    data.subheadline = $('#subheadline').value.trim();
    if (!data.headline) {
      toast('请先填写主标题');
      return;
    }
    const currentImageName = $('#imageName').value.trim();
    if (uploadedImage && currentImageName && currentImageName !== data.name) {
      uploadedImage = '';
      data.image = '';
      loadedProductImage = null;
      loadedImageSource = '';
      $('#imageFile').value = '';
      $('#imageFileName').textContent = '';
    }
    $('#imageName').value = data.name;
    $('#imageHeadline').value = data.headline;
    $('#imageSubheadline').value = data.subheadline;
    show('image-tool');
    renderMainImage();
  });
  ['imageName', 'imageHeadline', 'imageSubheadline'].forEach(id => {
    $(`#${id}`).addEventListener('input', () => {
      data.name = $('#imageName').value.trim();
      data.headline = $('#imageHeadline').value.trim();
      data.subheadline = $('#imageSubheadline').value.trim();
      renderMainImage();
    });
  });
  $$('.theme-chip').forEach(button => button.addEventListener('click', () => {
    $$('.theme-chip').forEach(item => item.classList.toggle('active', item === button));
    data.theme = button.dataset.theme;
    $('#canvasPreview').dataset.theme = data.theme;
    renderMainImage();
  }));

  $('#imageScale').addEventListener('input', event => {
    $('#imageScaleValue').textContent = `${event.target.value}%`;
    renderMainImage();
  });

  function textLines(context, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const char of String(text || '')) {
      if (context.measureText(line + char).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else line += char;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawWrappedText(context, text, x, y, maxWidth, size, weight, color, lineHeight, maxLines) {
    context.font = `${weight} ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.fillStyle = color;
    context.textAlign = 'left';
    context.textBaseline = 'top';
    const lines = textLines(context, text, maxWidth);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      let last = lines[maxLines - 1];
      while (last && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = `${last}…`;
    }
    lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
    return lines.length * lineHeight;
  }

  function renderMainImage() {
    const canvas = $('#mainImageCanvas');
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const colors = {
      warm: { top: '#f6f3ed', bottom: '#e8e5dc', surface: '#fffefa', ink: '#172321', muted: '#596964', accent: '#bd7955', line: '#d7d6cc' },
      garden: { top: '#eff3ec', bottom: '#dfe8dc', surface: '#fbfcf8', ink: '#173027', muted: '#5e7467', accent: '#5b8968', line: '#cbd8cb' },
      sky: { top: '#111b26', bottom: '#0a1018', surface: '#182534', ink: '#f0f6fc', muted: '#afbfce', accent: '#64dceb', line: '#334654' }
    };
    const palette = colors[data.theme] || colors.warm;
    const background = context.createLinearGradient(0, 0, 1000, 1200);
    background.addColorStop(0, palette.top);
    background.addColorStop(1, palette.bottom);
    context.fillStyle = background;
    context.fillRect(0, 0, 1200, 1200);

    context.fillStyle = palette.accent;
    context.fillRect(72, 68, 42, 5);
    context.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText('商品实拍', 128, 71);

    const title = $('#imageHeadline').value.trim() || '商品主图';
    let titleSize = 58;
    let titleLines = [];
    do {
      context.font = `700 ${titleSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      titleLines = textLines(context, title, 1048);
      titleSize -= 2;
    } while (titleLines.length > 2 && titleSize > 38);
    drawWrappedText(context, title, 72, 126, 1048, Math.max(titleSize, 38), 700, palette.ink, Math.max(titleSize, 38) * 1.24, 2);

    const subtitle = $('#imageSubheadline').value.trim();
    const subtitleTop = titleLines.length > 1 ? 286 : 222;
    drawWrappedText(context, subtitle, 76, subtitleTop, 1020, 27, 400, palette.muted, 38, 2);

    const frame = { x: 64, y: 386, width: 1072, height: 690, radius: 32 };
    context.save();
    context.shadowColor = data.theme === 'sky' ? '#00000066' : '#24362d1a';
    context.shadowBlur = 30;
    context.shadowOffsetY = 13;
    context.fillStyle = palette.surface;
    context.beginPath();
    context.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
    context.fill();
    context.restore();
    context.save();
    context.beginPath();
    context.roundRect(frame.x + 1, frame.y + 1, frame.width - 2, frame.height - 2, frame.radius);
    context.clip();
    if (loadedProductImage) {
      const inner = { x: frame.x + 28, y: frame.y + 24, width: frame.width - 56, height: frame.height - 48 };
      const containScale = Math.min(inner.width / loadedProductImage.width, inner.height / loadedProductImage.height);
      const scale = containScale * (Number($('#imageScale')?.value || 100) / 100);
      const imageWidth = loadedProductImage.width * scale;
      const imageHeight = loadedProductImage.height * scale;
      context.drawImage(loadedProductImage, frame.x + (frame.width - imageWidth) / 2, frame.y + (frame.height - imageHeight) / 2, imageWidth, imageHeight);
    } else {
      context.fillStyle = data.theme === 'sky' ? '#202e3c' : '#f3f3ee';
      context.fillRect(frame.x + 2, frame.y + 2, frame.width - 4, frame.height - 4);
      context.strokeStyle = palette.line;
      context.setLineDash([9, 10]);
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(frame.x + 50, frame.y + 50, frame.width - 100, frame.height - 100, 22);
      context.stroke();
      context.setLineDash([]);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = palette.ink;
      context.font = '600 32px "PingFang SC", "Microsoft YaHei", sans-serif';
      context.fillText('请先上传真实商品照片', 600, 690);
      context.fillStyle = palette.muted;
      context.font = '400 22px "PingFang SC", "Microsoft YaHei", sans-serif';
      context.fillText('请在左侧上传清晰的商品实拍图', 600, 738);
    }
    context.restore();

    context.fillStyle = palette.accent;
    context.fillRect(72, 1111, 6, 30);
    context.font = '600 22px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillStyle = palette.ink;
    context.fillText($('#imageName').value.trim() || data.name || '商品实拍展示', 94, 1126);
    context.textAlign = 'right';
    context.font = '400 18px "PingFang SC", "Microsoft YaHei", sans-serif';
    context.fillStyle = palette.muted;
    context.fillText('商品图 · 1200 × 1200', 1128, 1126);
  }

  async function downloadPng() {
    if (!uploadedImage || !loadedProductImage) {
      toast('请先在左侧上传真实商品照片后再导出');
      $('#imageFile').focus();
      return;
    }
    renderMainImage();
    const canSaveToFolder = await ensureFolderAccess();
    const canvas = $('#mainImageCanvas');
    canvas.toBlob(async blob => {
      if (!blob) return toast('图片导出失败，请重试');
      const filename = `${safeFileName(data.name)}-主图.png`;
      if (canSaveToFolder) {
        try {
          await writeFolderFile('主图导出', filename, blob);
        } catch {
          setFolderStatus('主图已下载，但未能写入文件夹；请重新连接后再试。');
        }
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      toast(canSaveToFolder ? '主图已下载并保存到资料文件夹' : '商品主图 PNG 已下载');
    }, 'image/png');
  }

  $('#downloadImage').addEventListener('click', downloadPng);

  function getSaved() {
    try { return JSON.parse(localStorage.getItem('merchant-studio-saved') || '[]'); }
    catch { return []; }
  }
  async function saveCurrent() {
    const canSaveToFolder = await ensureFolderAccess();
    data.name = $('#imageName').value.trim() || data.name || '未命名商品';
    data.headline = $('#imageHeadline').value.trim();
    data.subheadline = $('#imageSubheadline').value.trim();
    data.image = uploadedImage;
    const items = getSaved().filter(item => item.name !== data.name);
    const timestamp = new Date();
    const filename = `${safeFileName(data.name)}-${timestamp.toISOString().replace(/[:.]/g, '-')}`;
    const record = { ...data, id: Date.now(), created: timestamp.toLocaleDateString('zh-CN') };
    items.unshift(record);
    try {
      localStorage.setItem('merchant-studio-saved', JSON.stringify(items.slice(0, 8)));
      if (canSaveToFolder) {
        await writeFolderFile('商品记录', `${filename}.json`, new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
        if (uploadedImage) await writeFolderFile('原始图片', `${filename}.jpg`, dataUrlToBlob(uploadedImage));
        toast('商品资料和原图已保存到所选文件夹');
      } else {
        toast('商品资料已保存在当前浏览器；连接文件夹后可另存到文件夹');
      }
      updateAccount();
    } catch {
      if (canSaveToFolder) {
        setFolderStatus('写入文件夹失败，请重新连接后重试。');
        toast('浏览器记录已保留，但文件夹保存失败');
      } else {
        toast('浏览器空间不足，请先删除旧记录后再保存');
      }
    }
  }
  $('#saveProject').addEventListener('click', saveCurrent);

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }
  function renderSaved() {
    const container = $('#savedList');
    const items = getSaved();
    if (!items.length) {
      container.innerHTML = '<div class="panel empty-state"><div class="empty-icon">▧</div><h2>还没有保存的素材</h2><p>完成一款商品的文案和主图后，可以保存到这里。</p><button class="btn btn-primary btn-small" data-view="workspace">开始制作</button></div>';
      $('[data-view="workspace"]', container)?.addEventListener('click', () => show('workspace'));
      return;
    }
    container.innerHTML = items.map((item, index) => `<article class="saved-item"><div class="saved-thumb">✿</div><div><b>${escapeHtml(item.name || '未命名商品')}</b><small>${escapeHtml(item.headline || '商品素材')} · ${escapeHtml(item.created || '')}</small></div><button class="btn btn-secondary btn-small" data-open-saved="${index}">继续编辑</button></article>`).join('');
    $$('[data-open-saved]', container).forEach(button => button.addEventListener('click', () => {
      const item = items[Number(button.dataset.openSaved)];
      $('#productName').value = item.name || '';
      $('#category').value = item.category || '';
      $('#audience').value = item.audience || '';
      $('#productFacts').value = item.facts || '';
      $('#confirmedFacts').value = item.facts || '';
      $('#headline').value = item.headline || '';
      $('#subheadline').value = item.subheadline || '';
      $('#imageName').value = item.name || '';
      $('#imageHeadline').value = item.headline || '';
      $('#imageSubheadline').value = item.subheadline || '';
      $('#workspaceTitle').textContent = `${item.name || '商品'} · 商品素材`;
      uploadedImage = item.image || '';
      showUploadedImage(uploadedImage);
      data.name = item.name || '';
      data.category = item.category || '';
      data.audience = item.audience || '';
      data.facts = item.facts || '';
      data.headline = item.headline || '';
      data.subheadline = item.subheadline || '';
      data.theme = item.theme || 'warm';
      $('#canvasPreview').dataset.theme = data.theme;
      show('image-tool');
      syncPreview();
    }));
  }
  function updateAccount() { $('#savedCount').textContent = `${getSaved().length} 款`; }

  $('#notifyPlan').addEventListener('click', () => openModal('方案规划中', '专业版的价格、额度和实际 AI 能力还在规划中。当前版本不会收集联系方式，也不会发起扣款。'));
  $('#demoInfo').addEventListener('click', () => openModal('当前版本说明', '本机版本可通过已配置的 DeepSeek 生成卖点和标题，排版导出 PNG，并将记录保存在当前浏览器。上传的商品图片不会发送给 DeepSeek。'));
  $('#accountData').addEventListener('click', () => openModal('本机数据说明', '素材和上传图片保存在当前浏览器的本机存储中，不会同步到服务器。清理浏览器数据后记录可能无法恢复。'));
  function openModal(title, message) {
    $('#modalTitle').textContent = title;
    $('#modalText').textContent = message;
    $('#modal').classList.add('show');
  }
  $('#closeModal').addEventListener('click', () => $('#modal').classList.remove('show'));
  $('#modal').addEventListener('click', event => {
    if (event.target.id === 'modal') event.currentTarget.classList.remove('show');
  });
  refreshAiConfig();
})();
