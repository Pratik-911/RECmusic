// Song Explorer Chatbot - Frontend JavaScript
const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const randomBtn = document.getElementById('randomBtn');
const nowPlaying = document.getElementById('nowPlaying');
const quickBtns = document.querySelectorAll('.quick-btn');
const moodTags = document.querySelectorAll('.mood-tag');

// API Base URL
const API_URL = 'http://localhost:3000/api';

// Current song being explored
let currentSong = null;

// Add message to chat
function addMessage(content, isUser = false, isHtml = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = isUser ? '👤' : '🎵';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    if (isHtml) {
        messageContent.innerHTML = content;
    } else {
        messageContent.textContent = content;
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(messageContent);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Create song card HTML
function createSongCard(song, reason = '') {
    return `
        <div class="song-card">
            <div class="song-title">${song.title}</div>
            <div class="song-artist">by ${song.artist}</div>
            <div class="song-metadata">
                <span class="metadata-tag">🌍 ${song.language}</span>
                <span class="metadata-tag">🎸 ${song.genre}</span>
                <span class="metadata-tag">💫 ${song.mood}</span>
                <span class="metadata-tag">⚡ ${song.tempo} BPM</span>
            </div>
            ${reason ? `<div class="song-reason">✨ Why: ${reason}</div>` : ''}
        </div>
    `;
}

// Update Now Playing section
function updateNowPlaying(song) {
    if (!song) {
        nowPlaying.innerHTML = '<p class="empty-state">Ask for recommendations to see details!</p>';
        return;
    }
    
    nowPlaying.innerHTML = `
        <div class="song-title">${song.title}</div>
        <div class="song-artist">by ${song.artist}</div>
        <div class="song-metadata" style="margin-top: 1rem;">
            <span class="metadata-tag">🌍 ${song.language}</span>
            <span class="metadata-tag">🎸 ${song.genre}</span>
        </div>
        <div style="margin-top: 1rem;">
            <div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.5rem;">Mood:</div>
            <div>${song.mood}</div>
        </div>
        <div style="margin-top: 1rem;">
            <div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.5rem;">Lyrics snippet:</div>
            <div style="font-style: italic; color: var(--text-secondary);">"${song.lyrics}"</div>
        </div>
    `;
}

// Process user query
async function processQuery(query) {
    // Add user message
    addMessage(query, true);
    
    // Show typing indicator with varied messages
    const typingMessages = [
        '🎵 Let me explore my music collection for you...',
        '🎧 Searching through the beats and melodies...',
        '🎶 Finding the perfect tracks for you...',
        '🎸 Diving into my song database...'
    ];
    const randomTyping = typingMessages[Math.floor(Math.random() * typingMessages.length)];
    addMessage(randomTyping, false);
    
    try {
        // Check if it's a search query or recommendation request
        const isRecommendation = query.toLowerCase().includes('like') || 
                                query.toLowerCase().includes('similar') ||
                                query.toLowerCase().includes('recommend');
        
        if (isRecommendation) {
            // Extract song name from query
            const response = await fetch(`${API_URL}/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            
            const data = await response.json();
            
            // Remove typing indicator
            chatMessages.lastElementChild.remove();
            
            if (data.success && data.recommendations) {
                currentSong = data.targetSong;
                updateNowPlaying(data.targetSong);
                
                // Personalized responses based on mood
                let intro = '';
                const mood = data.targetSong.mood.toLowerCase();
                if (mood.includes('romantic')) {
                    intro = `<p>💕 Ah, <strong>${data.targetSong.title}</strong>! A beautiful choice for the heart! Here are some equally soul-stirring tracks:</p>`;
                } else if (mood.includes('energetic')) {
                    intro = `<p>⚡ <strong>${data.targetSong.title}</strong>! Now that's what I call energy! Let me pump up your playlist with these bangers:</p>`;
                } else if (mood.includes('melancholic')) {
                    intro = `<p>😌 <strong>${data.targetSong.title}</strong> - such a deep, emotional track. Here are some songs that capture similar feelings:</p>`;
                } else {
                    intro = `<p>🎶 Excellent taste! <strong>${data.targetSong.title}</strong> by ${data.targetSong.artist} is a gem! You'll definitely vibe with these:</p>`;
                }
                
                let html = intro;
                data.recommendations.forEach((song, index) => {
                    html += createSongCard(song, song.reason);
                });
                
                addMessage(html, false, true);
            } else {
                addMessage(data.message || "🎵 Hmm, I don't have that one in my collection. Try another song or be more specific!", false);
            }
        } else {
            // General search
            const response = await fetch(`${API_URL}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            
            const data = await response.json();
            
            // Remove typing indicator
            chatMessages.lastElementChild.remove();
            
            if (data.success && data.results.length > 0) {
                // Create personalized response based on filters
                let intro = '';
                if (data.languageFilter && data.moodFilter) {
                    const moodEmoji = {
                        'romantic': '💕',
                        'energetic': '⚡',
                        'peaceful': '🕊️',
                        'party': '🎉',
                        'happy': '😊',
                        'sad': '😢',
                        'melancholic': '🌙'
                    };
                    intro = `<p>${moodEmoji[data.moodFilter] || '🎵'} Perfect! I found ${data.results.length} ${data.moodFilter} ${data.languageFilter} songs that'll hit just right:</p>`;
                } else if (data.languageFilter) {
                    intro = `<p>🌍 Here are my top ${data.languageFilter} picks for you - ${data.results.length} amazing tracks:</p>`;
                } else if (data.moodFilter) {
                    const moodResponses = {
                        'romantic': `💕 Feeling the love? Here are ${data.results.length} romantic tracks to set the mood:`,
                        'energetic': `⚡ Ready to energize? ${data.results.length} high-energy tracks coming your way:`,
                        'peaceful': `🕊️ Need some calm? I've got ${data.results.length} peaceful melodies for you:`,
                        'party': `🎉 Party time! ${data.results.length} absolute bangers to get you moving:`,
                        'happy': `😊 Spreading good vibes! ${data.results.length} feel-good songs just for you:`,
                        'sad': `🌙 Sometimes we need to feel... Here are ${data.results.length} emotional tracks:`,
                        'melancholic': `🌧️ In a reflective mood? ${data.results.length} soulful songs for you:`
                    };
                    intro = `<p>${moodResponses[data.moodFilter] || `🎵 Found ${data.results.length} amazing tracks for you:`}</p>`;
                } else {
                    // Varied responses for general search
                    const responses = [
                        `<p>🎯 Boom! Found ${data.results.length} tracks that match your vibe:</p>`,
                        `<p>🎵 Your search hit the right notes! Here are ${data.results.length} songs I think you'll love:</p>`,
                        `<p>✨ Music magic happening! Check out these ${data.results.length} gems:</p>`,
                        `<p>🎧 DJ mode activated! ${data.results.length} tracks ready for your playlist:</p>`
                    ];
                    intro = responses[Math.floor(Math.random() * responses.length)];
                }
                
                let html = intro;
                data.results.slice(0, 5).forEach(song => {
                    html += createSongCard(song);
                });
                
                if (data.results.length > 5) {
                    html += `<p style="color: var(--text-secondary); font-style: italic;">...and ${data.results.length - 5} more! Try being more specific to narrow down.</p>`;
                }
                
                addMessage(html, false, true);
            } else {
                // Personalized "not found" messages
                const notFoundMessages = [
                    "🤔 Hmm, that's a tough one! My collection doesn't have exact matches. Try different keywords?",
                    "🎵 Oops! Came up empty on that search. Maybe try a song name, artist, or mood?",
                    "🔍 No luck with that search, friend! How about trying 'romantic Hindi songs' or 'energetic Marathi'?",
                    "🎸 That's not ringing any bells in my database. Want to explore by mood or language instead?"
                ];
                addMessage(notFoundMessages[Math.floor(Math.random() * notFoundMessages.length)], false);
            }
        }
    } catch (error) {
        console.error('Error:', error);
        // Remove typing indicator if exists
        if (chatMessages.lastElementChild.textContent.includes('Let me') || 
            chatMessages.lastElementChild.textContent.includes('Searching') ||
            chatMessages.lastElementChild.textContent.includes('Finding') ||
            chatMessages.lastElementChild.textContent.includes('Diving')) {
            chatMessages.lastElementChild.remove();
        }
        addMessage("🎸 Oops! Hit a wrong note there. Give me another shot?", false);
    }
}

// Get random song
async function getRandomSong() {
    try {
        const response = await fetch(`${API_URL}/random`);
        const data = await response.json();
        
        if (data.success && data.song) {
            currentSong = data.song;
            updateNowPlaying(data.song);
            
            let html = `<p>🎲 Here's a random song for you!</p>`;
            html += createSongCard(data.song);
            html += `<p>Want similar songs? Just ask me!</p>`;
            
            addMessage(html, false, true);
        }
    } catch (error) {
        console.error('Error:', error);
        addMessage("🎸 Couldn't get a random song. Please try again!", false);
    }
}

// Search by mood
async function searchByMood(mood) {
    const query = `${mood} songs`;
    userInput.value = query;
    await processQuery(query);
}

// Event Listeners
sendBtn.addEventListener('click', async () => {
    const query = userInput.value.trim();
    if (query) {
        userInput.value = '';
        await processQuery(query);
    }
});

userInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const query = userInput.value.trim();
        if (query) {
            userInput.value = '';
            await processQuery(query);
        }
    }
});

randomBtn.addEventListener('click', getRandomSong);

quickBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const query = btn.dataset.query;
        userInput.value = query;
        await processQuery(query);
    });
});

moodTags.forEach(tag => {
    tag.addEventListener('click', async () => {
        const mood = tag.dataset.mood;
        await searchByMood(mood);
    });
});

// Auto-focus input on load
window.addEventListener('load', () => {
    userInput.focus();
});

// Add some example interactions after a delay
setTimeout(() => {
    addMessage(`💡 <strong>Pro tip:</strong> Click on the mood tags in the sidebar to explore songs by mood! Or hit the "Surprise Me!" button for a random discovery! 🎲`, false, true);
}, 5000);
