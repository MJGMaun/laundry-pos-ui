import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const branchId = localStorage.getItem('branch_id')
  if (branchId) config.headers['X-Branch-Id'] = branchId

  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('branch_id')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export default api
