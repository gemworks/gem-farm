import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Farmer from '@/views/Farmer.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Farmer',
    component: Farmer,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
