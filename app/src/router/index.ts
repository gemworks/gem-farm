import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Your from '../views/Your.vue';
import All from '../views/All.vue';
import Find from '../views/Find.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Your vault',
    component: Your,
  },
  {
    path: '/',
    name: 'Find vault',
    component: Find,
  },
  {
    path: '/all',
    name: 'All vaults',
    component: All,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
