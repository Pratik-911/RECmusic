const express = require('express');
const cors = require('cors');
const path = require('path');
const songsDataset = require('./data/songs_dataset');
const Fuse = require('fuse.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize embedding model
let embedder = null;
let songEmbeddings = [];
let pipeline = null;

// Initialize Fuse.js for fuzzy search
const fuseOptions = {
  keys: ['title', 'artist', 'genre', 'mood', 'lyrics'],
  threshold: 0.4,
  includeScore: true
};
const fuse = new Fuse(songsDataset, fuseOptions);

// Initialize embeddings on server start
async function initializeEmbeddings() {
  try {
    console.log('🎵 Initializing song embeddings...');
    // Dynamic import for ES module
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    
    // Create embeddings for each song
    for (const song of songsDataset) {
      const songText = `${song.title} ${song.artist} ${song.genre} ${song.mood} ${song.lyrics}`;
      const output = await embedder(songText, { pooling: 'mean', normalize: true });
      songEmbeddings.push({
        id: song.id,
        embedding: Array.from(output.data)
      });
    }
    console.log('✅ Embeddings initialized successfully!');
  } catch (error) {
    console.error('Error initializing embeddings:', error);
    console.log('⚠️ Running without embeddings - using metadata-based recommendations only');
  }
}

// Calculate cosine similarity
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Find similar songs based on metadata
function findSimilarByMetadata(targetSong, limit = 5) {
  const similarities = songsDataset
    .filter(song => song.id !== targetSong.id)
    .map(song => {
      let score = 0;
      
      // Genre similarity (highest weight)
      if (song.genre === targetSong.genre) score += 30;
      else if (song.genre.toLowerCase().includes(targetSong.genre.toLowerCase().split(' ')[0])) score += 15;
      
      // Language similarity
      if (song.language === targetSong.language) score += 20;
      
      // Mood similarity
      const targetMoods = targetSong.mood.toLowerCase().split(',').map(m => m.trim());
      const songMoods = song.mood.toLowerCase().split(',').map(m => m.trim());
      const moodOverlap = targetMoods.filter(mood => 
        songMoods.some(m => m.includes(mood) || mood.includes(m))
      ).length;
      score += moodOverlap * 15;
      
      // Tempo similarity (within 20 BPM)
      const tempoDiff = Math.abs(song.tempo - targetSong.tempo);
      if (tempoDiff <= 10) score += 20;
      else if (tempoDiff <= 20) score += 10;
      else if (tempoDiff <= 30) score += 5;
      
      // Energy similarity
      const energyDiff = Math.abs(song.energy - targetSong.energy);
      score += (1 - energyDiff) * 15;
      
      // Acousticness similarity
      const acousticDiff = Math.abs(song.acousticness - targetSong.acousticness);
      score += (1 - acousticDiff) * 10;
      
      // Danceability similarity
      const danceDiff = Math.abs(song.danceability - targetSong.danceability);
      score += (1 - danceDiff) * 10;
      
      return { song, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  return similarities;
}

// RAG-based song recommendation endpoint
app.post('/api/recommend', async (req, res) => {
  try {
    const { query, songTitle } = req.body;
    
    // Find the target song
    let targetSong = null;
    if (songTitle) {
      const searchResults = fuse.search(songTitle);
      if (searchResults.length > 0) {
        targetSong = searchResults[0].item;
      }
    }
    
    if (!targetSong && query) {
      // Extract potential song name from query patterns
      let searchQuery = query;
      
      // Common patterns: "songs like X", "similar to X", "recommend songs like X"
      const patterns = [
        /songs?\s+like\s+(.+)/i,
        /similar\s+to\s+(.+)/i,
        /recommend.*like\s+(.+)/i,
        /find.*like\s+(.+)/i,
        /(.+)\s+type\s+songs?/i
      ];
      
      for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
          searchQuery = match[1].trim();
          break;
        }
      }
      
      // Try to find song from extracted query
      const searchResults = fuse.search(searchQuery);
      if (searchResults.length > 0) {
        targetSong = searchResults[0].item;
      }
    }
    
    if (!targetSong) {
      return res.json({
        success: false,
        message: "🎵 I couldn't find that song! Try being more specific or check the spelling.",
        suggestions: songsDataset.slice(0, 5).map(s => `${s.title} by ${s.artist}`)
      });
    }
    
    // Get similar songs using metadata
    const metadataSimilar = findSimilarByMetadata(targetSong, 8);
    
    // If embeddings are ready, also use semantic similarity
    let recommendations = metadataSimilar.map(item => item.song);
    
    if (embedder && songEmbeddings.length > 0) {
      const queryText = `${targetSong.title} ${targetSong.artist} ${targetSong.genre} ${targetSong.mood}`;
      const queryEmbedding = await embedder(queryText, { pooling: 'mean', normalize: true });
      const queryVector = Array.from(queryEmbedding.data);
      
      // Calculate semantic similarities
      const semanticSimilarities = songEmbeddings
        .filter(se => se.id !== targetSong.id)
        .map(se => ({
          id: se.id,
          similarity: cosineSimilarity(queryVector, se.embedding)
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);
      
      // Merge recommendations
      const semanticSongs = semanticSimilarities.map(s => 
        songsDataset.find(song => song.id === s.id)
      );
      
      // Combine and deduplicate
      const combinedIds = new Set();
      const combined = [];
      
      // Add top metadata matches
      metadataSimilar.slice(0, 3).forEach(item => {
        if (!combinedIds.has(item.song.id)) {
          combined.push(item.song);
          combinedIds.add(item.song.id);
        }
      });
      
      // Add top semantic matches
      semanticSongs.slice(0, 3).forEach(song => {
        if (!combinedIds.has(song.id)) {
          combined.push(song);
          combinedIds.add(song.id);
        }
      });
      
      // Fill remaining slots
      metadataSimilar.slice(3).forEach(item => {
        if (!combinedIds.has(item.song.id) && combined.length < 5) {
          combined.push(item.song);
          combinedIds.add(item.song.id);
        }
      });
      
      recommendations = combined.slice(0, 5);
    }
    
    // Generate reasoning for recommendations
    const reasons = recommendations.map(song => {
      const reasons = [];
      
      if (song.genre === targetSong.genre) {
        reasons.push(`same ${song.genre} genre`);
      }
      if (song.language === targetSong.language) {
        reasons.push(`${song.language} song`);
      }
      
      const tempoDiff = Math.abs(song.tempo - targetSong.tempo);
      if (tempoDiff <= 20) {
        reasons.push(`similar tempo (${song.tempo} BPM)`);
      }
      
      const targetMoods = targetSong.mood.toLowerCase().split(',').map(m => m.trim());
      const songMoods = song.mood.toLowerCase().split(',').map(m => m.trim());
      const sharedMoods = targetMoods.filter(mood => 
        songMoods.some(m => m.includes(mood) || mood.includes(m))
      );
      if (sharedMoods.length > 0) {
        reasons.push(`${sharedMoods[0]} vibes`);
      }
      
      if (Math.abs(song.energy - targetSong.energy) < 0.2) {
        reasons.push('similar energy');
      }
      
      return reasons.join(', ');
    });
    
    res.json({
      success: true,
      targetSong: {
        title: targetSong.title,
        artist: targetSong.artist,
        mood: targetSong.mood
      },
      recommendations: recommendations.map((song, index) => ({
        ...song,
        reason: reasons[index]
      }))
    });
    
  } catch (error) {
    console.error('Error in recommendation:', error);
    res.status(500).json({
      success: false,
      message: '🎸 Oops! Something went wrong. Let me try again!'
    });
  }
});

// Search endpoint with improved language and mood filtering
app.post('/api/search', (req, res) => {
  try {
    const { query } = req.body;
    const queryLower = query.toLowerCase();
    
    // Extract language and mood/genre from query
    const languages = ['hindi', 'marathi', 'english'];
    const moods = ['romantic', 'energetic', 'peaceful', 'party', 'melancholic', 'happy', 'sad'];
    
    let languageFilter = null;
    let moodFilter = null;
    let searchTerms = queryLower;
    
    // Check for language in query
    languages.forEach(lang => {
      if (queryLower.includes(lang)) {
        languageFilter = lang.charAt(0).toUpperCase() + lang.slice(1);
        searchTerms = searchTerms.replace(lang, '').trim();
      }
    });
    
    // Check for mood in query
    moods.forEach(mood => {
      if (queryLower.includes(mood)) {
        moodFilter = mood;
        searchTerms = searchTerms.replace(mood, '').trim();
      }
    });
    
    // Filter dataset based on language and mood
    let filteredDataset = songsDataset;
    
    if (languageFilter) {
      filteredDataset = filteredDataset.filter(song => 
        song.language.toLowerCase() === languageFilter.toLowerCase()
      );
    }
    
    if (moodFilter) {
      filteredDataset = filteredDataset.filter(song => 
        song.mood.toLowerCase().includes(moodFilter) ||
        song.genre.toLowerCase().includes(moodFilter)
      );
    }
    
    // If we have filters but no other search terms, return filtered results
    if ((languageFilter || moodFilter) && (!searchTerms || searchTerms === 'songs')) {
      const results = filteredDataset.slice(0, 10);
      res.json({
        success: true,
        results,
        languageFilter,
        moodFilter
      });
      return;
    }
    
    // Otherwise, search within filtered dataset
    const searchFuse = new Fuse(filteredDataset, fuseOptions);
    const results = searchTerms ? 
      searchFuse.search(searchTerms).slice(0, 10).map(r => r.item) : 
      filteredDataset.slice(0, 10);
    
    res.json({
      success: true,
      results,
      languageFilter,
      moodFilter
    });
  } catch (error) {
    console.error('Error in search:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
});

// Get all songs endpoint
app.get('/api/songs', (req, res) => {
  res.json({
    success: true,
    songs: songsDataset
  });
});

// Get random song
app.get('/api/random', (req, res) => {
  const randomSong = songsDataset[Math.floor(Math.random() * songsDataset.length)];
  res.json({
    success: true,
    song: randomSong
  });
});

// Initialize and start server
initializeEmbeddings().then(() => {
  app.listen(PORT, () => {
    console.log(`🎧 Song Explorer Chatbot running on http://localhost:${PORT}`);
    console.log(`📊 Dataset loaded with ${songsDataset.length} songs`);
  });
});
