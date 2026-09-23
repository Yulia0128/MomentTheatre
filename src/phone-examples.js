// Offline examples for the reading-style selector and simulated generation.
export const PHONE_EXAMPLES = [
  { type: 'text', sender: 'char', time: '23:48', text: '到家了吗？雨好像又大了。' },
  { type: 'text', sender: 'user', time: '23:48', text: '刚到。给你留了一杯热咖啡。' },
  { type: 'voice', sender: 'char', time: '23:49', duration: '12″', text: '刚把店门关好。明天一起吃早餐吧，我知道一家很好吃的小店。' },
  { type: 'transfer', sender: 'char', time: '23:49', amount: '¥ 52.00', status: '待收款', text: '明天的咖啡，我请。' },
  { type: 'sticker', sender: 'user', time: '23:50', sticker: 'happy', text: '开心小猫' },
  { type: 'image', sender: 'char', time: '23:50', text: '雨后的街角，一盏暖黄色的灯。窗边放着两杯冒热气的咖啡。' },
  { type: 'location', sender: 'char', time: '23:51', title: '临海街 · 雨歇咖啡', address: '虚拟定位 · 南岸路 18 号' },
  { type: 'share', sender: 'user', time: '23:51', title: '这家海边小店，藏着最好吃的早餐', description: '@慢慢生活的日记\n清晨七点，热汤与日出都刚刚好。', source: '生活手记 · 128 人分享' },
  { type: 'call', sender: 'char', time: '23:52' },
  { type: 'video', sender: 'user', time: '23:52' },
  { type: 'sticker', sender: 'char', time: '23:53', sticker: 'goodnight', text: '晚安小猫' },
];
