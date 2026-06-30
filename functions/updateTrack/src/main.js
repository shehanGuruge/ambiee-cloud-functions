const { Client, Databases } = require('node-appwrite');

async function toggleTrackName() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT) 
    .setProject(process.env.APPWRITE_PROJECT_ID) 
    .setKey(process.env.APPWRITE_API_KEY);       

  const databases = new Databases(client);

  const databaseId = '68fb73660036712381fa';
  const collectionId = 'tracks';
  const documentId = '6994ad5900251a6399d1'; 

  try {
    const currentDoc = await databases.getDocument(databaseId, collectionId, documentId);
    let currentName = currentDoc.trackName;
    let newName = '';

    if (currentName.endsWith('s')) {
      newName = currentName.slice(0, -1); 
    } else {
      newName = currentName + 's'; 
    }

    const result = await databases.updateDocument(
      databaseId,
      collectionId,
      documentId,
      { trackName: newName }
    );

    console.log(`Successfully toggled track name from "${currentName}" to "${newName}"`);
  } catch (error) {
    console.error('Error toggling track name:', error);
    process.exit(1); 
  }
}

toggleTrackName();