<template>
  <div>
    <h1>Dashboard</h1>
    <div class="dashboard-card">
      <h2>Total Posts</h2>
      <p v-if="isLoadingPosts">Loading...</p>
      <p v-else-if="isErrorPosts">Error loading posts.</p>
      <p v-else>{{ postsCount }}</p>
    </div>
    <div class="dashboard-card">
      <h2>Posts per User</h2>
      <p v-if="isLoadingPosts">Loading...</p>
      <p v-else-if="isErrorPosts">Error loading user data.</p>
      <ul v-else-if="Object.keys(userPostCounts).length > 0">
        <li v-for="(count, userId) in userPostCounts" :key="userId">
          User ID {{ userId }}: {{ count }} posts
        </li>
      </ul>
      <p v-else>No user post data available.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { queryCore, fetchPosts, POSTS_ENDPOINT_KEY, Post, EndpointState } from '../queryClient';

interface UserPostCounts {
  [userId: number]: number;
}

const postsState = ref<EndpointState<Post[]>>({
  data: undefined,
  isLoading: true,
  isError: false,
  error: undefined,
  lastUpdated: undefined,
});

let unsubscribe: (() => void) | undefined;

onMounted(async () => {
  await queryCore.defineEndpoint<Post[]>(POSTS_ENDPOINT_KEY, fetchPosts);

  unsubscribe = queryCore.subscribe<Post[]>(POSTS_ENDPOINT_KEY, (state) => {
    postsState.value = state;
  });

  const currentState = queryCore.getState<Post[]>(POSTS_ENDPOINT_KEY);
  if (!currentState.isLoading && !currentState.data) {
    queryCore.refetch<Post[]>(POSTS_ENDPOINT_KEY);
  }
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});

const isLoadingPosts = computed(() => postsState.value.isLoading);
const isErrorPosts = computed(() => postsState.value.isError);
const errorPosts = computed(() => postsState.value.error);

const postsCount = computed(() => {
  return postsState.value.data ? postsState.value.data.length : 0;
});

const userPostCounts = computed<UserPostCounts>(() => {
  if (!postsState.value.data) {
    return {};
  }
  const counts: UserPostCounts = {};
  postsState.value.data.forEach(post => {
    counts[post.userId] = (counts[post.userId] || 0) + 1;
  });
  return counts;
});

</script>

<style scoped>
.dashboard-card {
  background-color: #f0f0f0;
  padding: 15px;
  margin-bottom: 15px;
  border-radius: 5px;
}
.dashboard-card h2 {
  margin-top: 0;
}
</style>
