// public/main.js (Refactored for clarity and maintainability)

document.addEventListener('DOMContentLoaded', () => {

  /**
   * A reusable utility to show messages in a designated area.
   * @param {HTMLElement} area The message container element.
   * @param {string} text The message to display.
   * @param {'success' | 'error' | 'info'} type The type of the message for styling.
   */
  function showMessage(area, text, type) {
    area.textContent = text;
    area.className = `message-area visible ${type}`;
  }

  /**
   * Manages the book addition module.
   */
  const BookAdder = {
    form: document.getElementById('add-book-form'),
    messageArea: document.getElementById('add-book-message-area'),
    isbnInput: document.getElementById('isbn13'),
    coverPreview: document.getElementById('cover-preview'),

    init() {
      this.form.addEventListener('submit', this.handleSubmit.bind(this));
    },

    async handleSubmit(e) {
      e.preventDefault();
      showMessage(this.messageArea, '正在提交...', 'info');

      const formData = new FormData(this.form);
      const data = {
        ...Object.fromEntries(formData.entries()),
        cost: parseFloat(formData.get('cost')),
        selling_price: parseFloat(formData.get('selling_price')),
      };

      try {
        const response = await fetch('/api/inventory/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '未知错误');

        showMessage(this.messageArea, `成功！书籍ID "${result.id}" 已入库。`, 'success');
        this.form.reset();
        this.coverPreview.classList.remove('visible');
      } catch (error) {
        showMessage(this.messageArea, `错误: ${error.message}`, 'error');
      }
    }
  };

  /**
   * Manages the order fulfillment module.
   */
  const OrderFulfiller = {
    form: document.getElementById('fulfill-order-form'),
    messageArea: document.getElementById('fulfill-order-message-area'),

    init() {
      this.form.addEventListener('submit', this.handleSubmit.bind(this));
    },

    async handleSubmit(e) {
      e.preventDefault();
      showMessage(this.messageArea, '正在核销...', 'info');
      const pickupCode = new FormData(this.form).get('pickupCode');

      try {
        const response = await fetch('/api/orders/fulfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pickupCode }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '未知错误');

        showMessage(this.messageArea, `成功！订单 #${result.id} 已核销。`, 'success');
        this.form.reset();
      } catch (error) {
        showMessage(this.messageArea, `错误: ${error.message}`, 'error');
      }
    }
  };

  /**
   * Manages the pending orders dashboard.
   */
  const PendingOrdersDashboard = {
    container: document.getElementById('pending-orders-container'),
    messageArea: document.getElementById('pending-orders-message-area'),
    
    init() {
      this.fetchOrders(); // Fetch immediately on load
      setInterval(this.fetchOrders.bind(this), 10000); // And then every 10 seconds
    },

    async fetchOrders() {
      try {
        const response = await fetch('/api/orders/pending-pickup');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const orders = await response.json();
        
        this.render(orders);
      } catch (error) {
        showMessage(this.messageArea, `无法加载订单: ${error.message}`, 'error');
      }
    },

    render(orders) {
      if (orders.length === 0) {
        this.container.innerHTML = '<p class="empty-state">当前没有待取货的订单。</p>';
        return;
      }

      this.container.innerHTML = orders.map(order => `
        <div class="order-card">
          <div class="order-header">
            <strong>取货码: ${order.pickup_code}</strong>
            <span>¥${order.total_amount}</span>
          </div>
          <ul class="order-item-list">
            ${order.orderitem.map(item => `
              <li>${item.inventoryitem.booksku.bookmaster.title} (品相: ${item.inventoryitem.condition})</li>
            `).join('')}
          </ul>
        </div>
      `).join('');
    }
  };

  /**
   * Manages the ISBN scanner functionality.
   */
  const Scanner = {
    reader: new ZXing.BrowserMultiFormatReader(),
    container: document.getElementById('scanner-container'),
    videoElement: document.getElementById('video'),
    scanButton: document.getElementById('scan-btn'),
    closeButton: document.getElementById('close-scanner'),

    init() {
      this.scanButton.addEventListener('click', this.start.bind(this));
      this.closeButton.addEventListener('click', this.stop.bind(this));
    },

    start() {
      this.container.classList.add('visible');
      this.reader.listVideoInputDevices()
        .then(devices => {
          const backCamera = devices.find(d => d.label.toLowerCase().includes('back')) || devices[0];
          if (!backCamera) throw new Error('No camera found.');
          
          this.reader.decodeFromVideoDevice(backCamera.deviceId, this.videoElement, (result, err) => {
            if (result) {
              this.stop();
              this.handleScanSuccess(result.getText());
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
              console.error(err);
              showMessage(BookAdder.messageArea, `扫码失败: ${err.message}`, 'error');
              this.stop();
            }
          });
        })
        .catch(err => {
          showMessage(BookAdder.messageArea, `摄像头错误: ${err.message}`, 'error');
          this.stop();
        });
    },

    stop() {
      this.reader.reset();
      this.container.classList.remove('visible');
    },

    async handleScanSuccess(isbn) {
      BookAdder.isbnInput.value = isbn;
      showMessage(BookAdder.messageArea, '正在查询图书信息...', 'info');
      BookAdder.coverPreview.classList.remove('visible');

      try {
        const response = await fetch(`/api/books/meta?isbn=${isbn}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const meta = await response.json();
        
        BookAdder.form.elements.title.value = meta.title || '';
        BookAdder.form.elements.author.value = meta.author || '';
        if (meta.cover_image_url) {
          BookAdder.coverPreview.src = meta.cover_image_url;
          BookAdder.coverPreview.classList.add('visible');
        }
        showMessage(BookAdder.messageArea, '信息已自动填充。', 'success');
      } catch (error) {
        showMessage(BookAdder.messageArea, '未找到图书信息，请手动输入。', 'error');
      }
    }
  };

  // Initialize all modules
  BookAdder.init();
  OrderFulfiller.init();
  PendingOrdersDashboard.init();
  Scanner.init();
});