<template>
  <div class="post-detail-container">
    <div v-if="isLoading">Loading post details...</div>
    <div v-else-if="isError">Error fetching post: {{ error?.message || 'Unknown error' }}</div>
    <div v-else-if="post">
      <h1>{{ post.title }}</h1>
      <p>{{ post.body }}</p>
      <small>User ID: {{ post.userId }}</small>
      <br />
      <small>Post ID: {{ post.id }}</small>
    </div>
    <div v-else>Post not found.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { queryCore, fetchPostById, POST_DETAIL_ENDPOINT_KEY_PREFIX, Post, EndpointState } from '../queryClient';

const route = useRoute();
const postId = computed(() => route.params.id as string);

const postState = ref<EndpointState<Post>>({
  data: undefined,
  isLoading: true,
  isError: false,
  error: undefined,
  lastUpdated: undefined,
});

let unsubscribe: (() => void) | undefined;
const currentEndpointKey = ref('');

async function setupEndpoint(id: string) {
  if (!id) {
    postState.value = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Post ID is missing'),
      lastUpdated: undefined,
    };
    return;
  }

  const endpointKey = `${POST_DETAIL_ENDPOINT_KEY_PREFIX}${id}`;
  currentEndpointKey.value = endpointKey;

  // Clean up previous subscription if any
  if (unsubscribe) {
    unsubscribe();
  }

  await queryCore.defineEndpoint<Post>(endpointKey, () => fetchPostById(id));

  unsubscribe = queryCore.subscribe<Post>(endpointKey, (state) => {
    postState.value = state;
  });

  const currentState = queryCore.getState<Post>(endpointKey);
  if (!currentState.isLoading && !currentState.data) {
    queryCore.refetch<Post>(endpointKey);
  }
}

watch(postId, (newId, oldId) => {
  if (newId && newId !== oldId) {
    setupEndpoint(newId);
  }
}, { immediate: true }); // immediate: true to run on component mount


onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
  // Optional: Invalidate or clean up the specific post detail endpoint
  // if (currentEndpointKey.value) {
  //   queryCore.invalidate(currentEndpointKey.value);
  // }
});

// Computed properties for the template
const isLoading = computed(() => postState.value.isLoading);
const isError = computed(() => postState.value.isError);
const error = computed(() => postState.value.error);
const post = computed(() => postState.value.data);

</script>

<style scoped>
.post-detail-container {
  padding: 20px;
  background-color: #fff;
  border-radius: 5px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.post-detail-container h1 {
  font-size: 1.8em;
  color: #222;
  margin-bottom: 10px;
}
.post-detail-container p {
  font-size: 1em;
  line-height: 1.6;
  color: #444;
  margin-bottom: 15px;
}
.post-detail-container small {
  font-size: 0.85em;
  color: #777;
  display: block;
  margin-top: 5px;
}
</style>
