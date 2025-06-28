<template>
  <div>
    <h1>Posts</h1>
    <div v-if="isLoading">Loading posts...</div>
    <div v-else-if="isError">Error fetching posts: {{ error?.message || 'Unknown error' }}</div>
    <ul v-else-if="posts && posts.length > 0" class="posts-list">
      <li v-for="post in posts" :key="post.id">
        <router-link :to="`/posts/${post.id}`">
          <h2>{{ post.title }}</h2>
        </router-link>
        <p>{{ post.body }}</p>
      </li>
    </ul>
    <div v-else>No posts found.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { queryCore, fetchPosts, POSTS_ENDPOINT_KEY, Post, EndpointState } from '../queryClient'; // Added Post and EndpointState

const postsState = ref<EndpointState<Post[]>>({
  data: undefined,
  isLoading: true,
  isError: false,
  error: undefined,
  lastUpdated: undefined,
});

let unsubscribe: (() => void) | undefined;

onMounted(async () => {
  // Define the endpoint
  await queryCore.defineEndpoint<Post[]>(POSTS_ENDPOINT_KEY, fetchPosts);

  // Subscribe to the endpoint
  unsubscribe = queryCore.subscribe<Post[]>(POSTS_ENDPOINT_KEY, (state) => {
    postsState.value = state;
  });

  // Initial fetch if not already loading or data not present
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

import { computed } from 'vue'; // Import computed

// Computed properties to be used in the template
const isLoading = computed(() => postsState.value.isLoading);
const isError = computed(() => postsState.value.isError);
const error = computed(() => postsState.value.error);
const posts = computed(() => postsState.value.data);

</script>

<style scoped>
.posts-list li {
  background-color: #f9f9f9;
  border: 1px solid #eee;
  padding: 10px 15px;
  margin-bottom: 10px;
  border-radius: 4px;
}
.posts-list li h2 {
  margin: 0 0 5px 0;
  font-size: 1.2em;
}
.posts-list li p {
  margin: 0;
  font-size: 0.9em;
  color: #555;
}
a {
  text-decoration: none;
  color: #007bff;
}
a:hover h2 {
  text-decoration: underline;
}
</style>
