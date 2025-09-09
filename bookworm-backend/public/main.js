// public/main.js (fully replaced with final logic)
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selection ---
    const addBookForm = document.getElementById('add-book-form');
    const addBookMessageArea = document.getElementById('add-book-message-area');
    const isbnInput = document.getElementById('isbn13');
    const coverPreview = document.getElementById('cover-preview');
    const scanButton = document.getElementById('scan-btn');
    const scannerContainer = document.getElementById('scanner-container');
    const videoElement = document.getElementById('video');
    const closeScannerButton = document.getElementById('close-scanner');
    const fulfillForm = document.getElementById('fulfill-order-form');
    const fulfillMessageArea = document.getElementById('fulfill-order-message-area');

    // --- Helper to display messages ---
    function showMessage(area, text, type) {
        area.textContent = text;
        area.className = `message-area visible ${type}`;
    }
    function hideMessage(area) {
        area.textContent = '';
        area.className = 'message-area';
    }

    // --- ZXing Scanner Logic ---
    const codeReader = new ZXing.BrowserMultiFormatReader();
    scanButton.addEventListener('click', () => {
        scannerContainer.classList.add('visible');
        codeReader.listVideoInputDevices()
            .then((videoInputDevices) => {
                const backCamera = videoInputDevices.find(device => device.label.toLowerCase().includes('back'));
                const selectedDeviceId = backCamera ? backCamera.deviceId : (videoInputDevices.length ? videoInputDevices[0].deviceId : null);
                
                if (!selectedDeviceId) {
                    handleScanError('No camera found.');
                    return;
                }

                codeReader.decodeFromVideoDevice(selectedDeviceId, 'video', (result, err) => {
                    if (result) {
                        stopScanner();
                        handleScanSuccess(result.getText());
                    }
                    if (err && !(err instanceof ZXing.NotFoundException)) {
                        handleScanError(err.message);
                    }
                });
            })
            .catch(err => handleScanError(err.message));
    });

    function stopScanner() {
        codeReader.reset();
        scannerContainer.classList.remove('visible');
    }

    function handleScanError(errorMessage) {
        stopScanner();
        showMessage(addBookMessageArea, `扫码失败: ${errorMessage}`, 'error');
    }

    async function handleScanSuccess(isbn) {
        isbnInput.value = isbn;
        showMessage(addBookMessageArea, '正在查询图书信息...', 'info');
        coverPreview.classList.remove('visible');

        try {
            const response = await fetch(`/api/books/meta?isbn=${isbn}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const metadata = await response.json();

            // Auto-fill the form
            addBookForm.elements.title.value = metadata.title || '';
            addBookForm.elements.author.value = metadata.author || '';
            
            if (metadata.cover_image_url) {
                coverPreview.src = metadata.cover_image_url;
                coverPreview.classList.add('visible');
            }

            showMessage(addBookMessageArea, '信息已自动填充，请确认并填写价格。', 'success');

        } catch (error) {
            console.error('Failed to fetch metadata:', error);
            showMessage(addBookMessageArea, '未找到图书信息，请手动输入。', 'error');
        }
    }

    closeScannerButton.addEventListener('click', stopScanner);

    // --- Form Submission Logic ---
    addBookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessage(addBookMessageArea);
        const formData = new FormData(addBookForm);
        const data = Object.fromEntries(formData.entries());
        data.cost = parseFloat(data.cost);
        data.selling_price = parseFloat(data.selling_price);

        try {
            const response = await fetch('/api/inventory/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Unknown error');
            
            showMessage(addBookMessageArea, `成功！书籍 "${result.id}" 已入库。`, 'success');
            addBookForm.reset();
            coverPreview.classList.remove('visible');
        } catch (error) {
            showMessage(addBookMessageArea, `错误: ${error.message}`, 'error');
        }
    });

    fulfillForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessage(fulfillMessageArea);
        const formData = new FormData(fulfillForm);
        const pickupCode = formData.get('pickupCode');

        try {
            const response = await fetch('/api/orders/fulfill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pickupCode }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Unknown error');

            showMessage(fulfillMessageArea, `成功！订单 #${result.id} 已核销。`, 'success');
            fulfillForm.reset();
        } catch (error) {
            showMessage(fulfillMessageArea, `错误: ${error.message}`, 'error');
        }
    });
});