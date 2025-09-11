// components/skeleton/skeleton.js
Component({
  properties: {
    type: {
      type: String,
      value: 'grid' // 'grid', 'detail', 'list'
    },
    count: {
      type: Number,
      value: 4
    }
  }
});