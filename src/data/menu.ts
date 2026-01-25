import type { MenuItem } from '@/types/menu';

export const menuItems: MenuItem[] = [
  // Coffee
  { id: 'americano', name: '아메리카노', nameEn: 'Americano', category: 'coffee', price: 4500, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/americano.jpg' },
  { id: 'cafe-latte', name: '카페라떼', nameEn: 'Cafe Latte', category: 'coffee', price: 5000, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/cafe-latte.jpg' },
  { id: 'vanilla-latte', name: '바닐라라떼', nameEn: 'Vanilla Latte', category: 'coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/vanilla-latte.jpg' },
  { id: 'caramel-macchiato', name: '카라멜 마키아토', nameEn: 'Caramel Macchiato', category: 'coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/caramel-macchiato.jpg' },
  { id: 'hazelnut-latte', name: '헤이즐넛라떼', nameEn: 'Hazelnut Latte', category: 'coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/hazelnut-latte.jpg' },
  { id: 'cold-brew', name: '콜드브루', nameEn: 'Cold Brew', category: 'coffee', price: 5000, temperatures: ['ICE'], available: true, image: '/images/menu/cold-brew.jpg' },
  { id: 'espresso', name: '에스프레소', nameEn: 'Espresso', category: 'coffee', price: 3500, temperatures: ['HOT'], available: true, image: '/images/menu/espresso.jpg' },
  { id: 'cappuccino', name: '카푸치노', nameEn: 'Cappuccino', category: 'coffee', price: 5000, temperatures: ['HOT'], available: true, image: '/images/menu/cappuccino.jpg' },

  // Non-Coffee
  { id: 'green-tea-latte', name: '녹차라떼', nameEn: 'Green Tea Latte', category: 'non-coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/green-tea-latte.jpg' },
  { id: 'chocolate-latte', name: '초코라떼', nameEn: 'Chocolate Latte', category: 'non-coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/chocolate-latte.jpg' },
  { id: 'matcha-latte', name: '말차라떼', nameEn: 'Matcha Latte', category: 'non-coffee', price: 6000, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/matcha-latte.jpg' },
  { id: 'milk-tea', name: '밀크티', nameEn: 'Milk Tea', category: 'non-coffee', price: 5000, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/milk-tea.jpg' },
  { id: 'strawberry-latte', name: '딸기라떼', nameEn: 'Strawberry Latte', category: 'non-coffee', price: 6000, temperatures: ['ICE'], available: true, image: '/images/menu/strawberry-latte.jpg' },
  { id: 'orange-juice', name: '오렌지주스', nameEn: 'Orange Juice', category: 'non-coffee', price: 5500, temperatures: ['ICE'], available: true, image: '/images/menu/orange-juice.jpg' },

  // Dessert
  { id: 'croissant', name: '크루아상', nameEn: 'Croissant', category: 'dessert', price: 4000, temperatures: [], available: true, image: '/images/menu/croissant.jpg' },
  { id: 'chocolate-cake', name: '초코케이크', nameEn: 'Chocolate Cake', category: 'dessert', price: 6500, temperatures: [], available: true, image: '/images/menu/chocolate-cake.jpg' },
  { id: 'cheesecake', name: '치즈케이크', nameEn: 'Cheesecake', category: 'dessert', price: 6500, temperatures: [], available: true, image: '/images/menu/cheesecake.jpg' },
  { id: 'tiramisu', name: '티라미수', nameEn: 'Tiramisu', category: 'dessert', price: 7000, temperatures: [], available: true, image: '/images/menu/tiramisu.jpg' },

  // Seasonal
  { id: 'pumpkin-latte', name: '펌킨라떼', nameEn: 'Pumpkin Latte', category: 'seasonal', price: 6500, temperatures: ['HOT', 'ICE'], available: true, image: '/images/menu/pumpkin-latte.jpg', description: '가을 한정' },
  { id: 'strawberry-ade', name: '딸기에이드', nameEn: 'Strawberry Ade', category: 'seasonal', price: 6000, temperatures: ['ICE'], available: true, image: '/images/menu/strawberry-ade.jpg', description: '봄 한정' },
];
