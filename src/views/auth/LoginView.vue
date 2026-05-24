<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useBranchStore } from '@/stores/branch.js';

const router = useRouter();
const auth = useAuthStore();
const branch = useBranchStore();

const form = ref({ username: '', password: '' });
const error = ref('');
const loading = ref(false);
const showPassword = ref(false);

async function submit() {
    error.value = '';
    loading.value = true;
    try {
        const data = await auth.login(form.value);

        const userBranches = data.user?.branches || [];
        const isSuperAdmin = data.user?.role === 'super_admin';
        const isAdmin =
            data.user?.role === 'admin' || data.user?.role === 'super_admin';

        if (isSuperAdmin) {
            // Super admin sees all branches, not just assigned ones
            try {
                await branch.loadBranches();
            } catch {}
        } else if (userBranches.length) {
            branch.setBranches(userBranches);
        } else {
            try {
                await branch.loadBranches();
            } catch {}
        }

        const primary = userBranches.find((b) => b.pivot?.is_primary);
        if (primary) {
            branch.selectBranch(primary.id);
        } else if (branch.branches.length === 1) {
            branch.selectBranch(branch.branches[0].id);
        }

        if (isAdmin) {
            router.push('/dashboard');
            return;
        }

        router.push('/pos');
    } catch (e) {
        error.value = e.response?.data?.message || 'Invalid credentials.';
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div
        class="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
        style="background: #0f172a"
    >
        <!-- Animated gradient orbs -->
        <div class="orb orb-1" />
        <div class="orb orb-2" />
        <div class="orb orb-3" />

        <!-- Grid pattern -->
        <div
            class="absolute inset-0 opacity-[0.04]"
            style="
                background-image:
                    linear-gradient(
                        rgba(255, 255, 255, 0.1) 1px,
                        transparent 1px
                    ),
                    linear-gradient(
                        90deg,
                        rgba(255, 255, 255, 0.1) 1px,
                        transparent 1px
                    );
                background-size: 48px 48px;
            "
        />

        <!-- Card -->
        <div
            class="animate-slide-up relative w-full max-w-[380px]"
            style="
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 24px;
                backdrop-filter: blur(20px);
                box-shadow: 0 32px 80px rgba(0, 0, 0, 0.5);
            "
        >
            <!-- Inner glow top border -->
            <div
                class="absolute top-0 right-8 left-8 h-px rounded-full"
                style="
                    background: linear-gradient(
                        90deg,
                        transparent,
                        rgba(99, 102, 241, 0.8),
                        transparent
                    );
                "
            />

            <div class="p-8">
                <!-- Logo -->
                <div class="flex flex-col items-center">
                    <img
                        src="@/assets/logo-pos.png"
                        alt="Laundry POS"
                        class="mb-4 h-36 w-auto drop-shadow-lg"
                    />
                </div>

                <form @submit.prevent="submit" class="space-y-4">
                    <!-- Username -->
                    <div class="space-y-1.5">
                        <label
                            class="text-xs font-medium"
                            style="color: rgba(148, 163, 184, 0.9)"
                            >Username</label
                        >
                        <div class="relative">
                            <div
                                class="absolute top-1/2 left-3 -translate-y-1/2"
                                style="color: rgba(148, 163, 184, 0.5)"
                            >
                                <svg
                                    class="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                    />
                                </svg>
                            </div>
                            <input
                                v-model="form.username"
                                type="text"
                                required
                                placeholder="Username"
                                class="login-input"
                                autocomplete="username"
                            />
                        </div>
                    </div>

                    <!-- Password -->
                    <div class="space-y-1.5">
                        <label
                            class="text-xs font-medium"
                            style="color: rgba(148, 163, 184, 0.9)"
                            >Password</label
                        >
                        <div class="relative">
                            <div
                                class="absolute top-1/2 left-3 -translate-y-1/2"
                                style="color: rgba(148, 163, 184, 0.5)"
                            >
                                <svg
                                    class="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <rect
                                        x="3"
                                        y="11"
                                        width="18"
                                        height="11"
                                        rx="2"
                                    />
                                    <path d="M7 11V7a5 5 0 0110 0v4" />
                                </svg>
                            </div>
                            <input
                                v-model="form.password"
                                :type="showPassword ? 'text' : 'password'"
                                required
                                placeholder="Password"
                                class="login-input login-input-icons"
                            />
                            <button
                                type="button"
                                class="absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                                style="color: rgba(148, 163, 184, 0.5)"
                                @click="showPassword = !showPassword"
                            >
                                <svg
                                    v-if="!showPassword"
                                    class="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                </svg>
                                <svg
                                    v-else
                                    class="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Error -->
                    <Transition name="shake">
                        <div
                            v-if="error"
                            class="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
                            style="
                                background: rgba(239, 68, 68, 0.12);
                                border: 1px solid rgba(239, 68, 68, 0.25);
                                color: #fca5a5;
                            "
                        >
                            <svg
                                class="h-4 w-4 shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            {{ error }}
                        </div>
                    </Transition>

                    <!-- Submit -->
                    <button
                        type="submit"
                        :disabled="loading"
                        class="relative w-full overflow-hidden rounded-xl py-3 text-sm font-bold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
                        style="
                            background: linear-gradient(
                                135deg,
                                #3b82f6,
                                #6366f1
                            );
                            box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
                        "
                        :style="
                            !loading
                                ? 'box-shadow: 0 4px 16px rgba(99,102,241,0.4);'
                                : ''
                        "
                    >
                        <span v-if="!loading">Sign In →</span>
                        <span
                            v-else
                            class="flex items-center justify-center gap-2"
                        >
                            <svg
                                class="h-4 w-4 animate-spin"
                                viewBox="0 0 24 24"
                                fill="none"
                            >
                                <circle
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="rgba(255,255,255,0.3)"
                                    stroke-width="3"
                                />
                                <path
                                    d="M12 2a10 10 0 0110 10"
                                    stroke="white"
                                    stroke-width="3"
                                    stroke-linecap="round"
                                />
                            </svg>
                            Signing in…
                        </span>
                        <!-- Hover shimmer -->
                        <div class="login-btn-shimmer" />
                    </button>
                </form>
            </div>
        </div>
    </div>
</template>

<style scoped>
.orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    animation: float 8s ease-in-out infinite;
}

.orb-1 {
    width: 400px;
    height: 400px;
    background: rgba(99, 102, 241, 0.15);
    top: -100px;
    right: -50px;
}

.orb-2 {
    width: 300px;
    height: 300px;
    background: rgba(59, 130, 246, 0.12);
    bottom: -80px;
    left: -60px;
    animation-delay: -3s;
}

.orb-3 {
    width: 200px;
    height: 200px;
    background: rgba(139, 92, 246, 0.1);
    top: 50%;
    left: 50%;
    animation-delay: -5s;
}

@keyframes float {
    0%,
    100% {
        transform: translateY(0) scale(1);
    }

    50% {
        transform: translateY(-30px) scale(1.05);
    }
}

.login-input {
    width: 100%;
    padding: 10px 13px 10px 2.5rem;
    border-radius: 12px;
    font-size: 14px;
    outline: none;
    transition: all 180ms ease;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: white;
}

.login-input:hover {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
}

.login-input:focus {
    border-color: rgba(99, 102, 241, 0.6);
    background: rgba(99, 102, 241, 0.08);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.login-input::placeholder {
    color: rgba(148, 163, 184, 0.4);
}

.login-input-icons {
    padding-right: 2.5rem;
}

.login-btn-shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
        105deg,
        transparent 40%,
        rgba(255, 255, 255, 0.15) 50%,
        transparent 60%
    );
    background-size: 200% 100%;
    background-position: 200% 0;
    transition: background-position 400ms ease;
}

button:hover .login-btn-shimmer {
    background-position: -50% 0;
}

.shake-enter-active {
    animation: shake 350ms ease;
}

@keyframes shake {
    0%,
    100% {
        transform: translateX(0);
    }

    20% {
        transform: translateX(-6px);
    }

    40% {
        transform: translateX(6px);
    }

    60% {
        transform: translateX(-4px);
    }

    80% {
        transform: translateX(4px);
    }
}

.animate-spin {
    animation: spin 800ms linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
