import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import BankManager from '../views/BankManager.vue';
import VaultOwner from '../views/VaultOwner.vue';
import Home from '@/views/Home.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Home',
    component: Home,
  },
  {
    path: '/bank',
    name: 'Bank Manager',
    component: BankManager,
  },
  {
    path: '/vault',
    name: 'Vault Owner',
    component: VaultOwner,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
