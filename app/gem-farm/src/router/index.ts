import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Farmer from '@/views/Farmer.vue';
import Manager from '@/views/Manager.vue';
import Home from '@/views/Home.vue';
import Jeongsoo from '@/views/Jeongsoo.vue';


const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Home',
    component: Home,
  },
  {
    path: '/Jeongsoo',
    name: 'Jeongsoo',
    component: Jeongsoo,
  },
  {
    path: '/manager',
    name: 'Farm Manager',
    component: Manager,
  },
  {
    path: '/farmer',
    name: 'Farmer',
    component: Farmer,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
