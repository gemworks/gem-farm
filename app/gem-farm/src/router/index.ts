import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import Farmer from '@/views/Farmer.vue';
import Manager from '@/views/Manager.vue';
import Home from '@/views/Home.vue';

const routes: Array<RouteRecordRaw> = [
  // {
  //   path: '/',
  //   name: 'Home',
  //   component: Home,
  // },
  // {
  //   path: '/manager',
  //   name: 'Farm Manager',
  //   component: Manager,
  // },
  // {
  //   path: '/farmer',
  //   name: 'Farmer',
  //   component: Farmer,
  // },
  {
    path: '/staking/coinfra-samurai',
    component: Farmer,
    props: {
      collectionName: 'Coinfra Samurai',
      farmAddress: '4dHHXbjg2BcMhxZFNj4YPUHXpVWsZFWNTCiKmojJTyQS',
    },
  },
  {
    path: '/staking/shinobi-girls',
    component: Farmer,
    props: {
      collectionName: 'Shinobi Girls',
      farmAddress: '4aG3Vn36dQycYfnMX9mZQQHaZgA5P85uevvn5e2JwUfJ',
    },
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

export default router;
