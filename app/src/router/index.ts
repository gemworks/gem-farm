import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import YourVault from '../views/YourVault.vue';
import AllVaults from '../views/AllVaults.vue';
import FindVaults from '../views/FindVault.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Your vault',
    component: YourVault,
  },
  {
    path: '/find',
    name: 'Find vault',
    component: FindVaults,
  },
  {
    path: '/all',
    name: 'All vaults',
    component: AllVaults,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
