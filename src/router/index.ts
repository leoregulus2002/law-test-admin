import { createRouter, createWebHistory } from 'vue-router'
import { authState } from '../lib/auth'
import AdminLoginView from '../views/AdminLoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import UserManagementView from '../views/UserManagementView.vue'
import SecurityView from '../views/SecurityView.vue'
import QuestionBanksView from '../views/QuestionBanksView.vue'
import QuestionsView from '../views/QuestionsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: AdminLoginView, meta: { guest: true } },
    { path: '/', component: DashboardView, meta: { requiresAuth: true } },
    { path: '/question-banks', component: QuestionBanksView, meta: { requiresAuth: true } },
    { path: '/questions', component: QuestionsView, meta: { requiresAuth: true } },
    { path: '/users', component: UserManagementView, meta: { requiresAuth: true } },
    { path: '/security', component: SecurityView, meta: { requiresAuth: true } },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !authState.session) return '/login'
  if (to.meta.guest && authState.session) return '/'
})

export default router
