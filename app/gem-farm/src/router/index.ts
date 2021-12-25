import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import FarmFarmer from '@/views/gem-farm/FarmFarmer.vue';
import FarmManager from '@/views/gem-farm/FarmManager.vue';
import FarmHome from '@/views/gem-farm/FarmHome.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Home',
    component: FarmHome,
  },
  {
    path: '/manager',
    name: 'Farm Manager',
    component: FarmManager,
  },
  {
    path: '/farmer',
    name: 'Farmer',
    component: FarmFarmer,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
