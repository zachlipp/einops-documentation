const repoOwner = "arogozhnikov";
const repoName = "einops";
const directoryPath = "docs";
const branch = "main";

let db;

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("JupyterLite Storage");

    request.onsuccess = function (event) {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = function (event) {
      reject("Error opening IndexedDB: " + event.target);
    };
  });
}

async function fetchDirectoryContents() {
  const apiURL = `https://api.github.com/repos/${repoOwner}/${
    repoName
  }/contents/${directoryPath}?ref=${branch}`;

  try {
    const response = await fetch(apiURL, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API request failed: ${response.status}`);
    }

    const files = await response.json();
    const fileFetchPromises = files
      .filter((file) => file.type === "file") // Only download files
      .map((file) => fetchFileAndStore(file.download_url, file.name));

    await Promise.all(fileFetchPromises);
    console.log("All files fetched and stored in IndexedDB.");
  } catch (error) {
    console.error("Error fetching directory contents:", error);
  }
}

async function handleFileData(filename, response, blob) {
  // TODO: Can I reuse something here?
  const filetypes = {
    ipynb: {
      format: "json",
      type: "notebook",
      mimetype: "octect/stream",
    },
    jpg: { format: "base64", type: "file", mimetype: "image/jpg" },
    png: { format: "base64", type: "file", mimetype: "image/png" },
    md: { format: "text", type: "file", mimetype: "text/markdown" },
    txt: { format: "text", type: "file", mimetype: "text/markdown" },
    html: { format: "base64", type: "file", mimetype: "text/html" },
  };

  var extension = filename.split(".").at(-1);
  var metadata = filetypes[extension];
  if (metadata["format"] == "json") {
    metadata.content = await response.json();
  } else {
    metadata.content = await blob.text();
  }
  return metadata;
}

async function fetchFileAndStore(url, filename) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${filename}`);
    }

    const clone = response.clone();
    var blob = await response.blob();
    var metadata = {
      name: filename,
      path: filename,
      last_modified: new Date(Date.now()).toISOString(),
      // TODO: Seems iffy
      created: new Date(Date.now()).toISOString(),
      size: blob.size,
      writeable: true,
    };

    var fileInfo = await handleFileData(filename, clone, blob);

    var myFile = { ...metadata, ...fileInfo };
    // Store the file in IndexedDB
    const transaction = db.transaction("files", "readwrite");
    const objectStore = transaction.objectStore("files");
    objectStore.put(myFile, filename);

    transaction.oncomplete = () => {
      console.log(`${filename} stored in IndexedDB.`);
    };

    transaction.onerror = (event) => {
      console.error("Error storing file in IndexedDB:", event.target.error);
    };
  } catch (error) {
    console.error(`Error fetching file ${filename}:`, error);
  }
}

async function downloadNotebooks() {
  await openDB();
  await fetchDirectoryContents();
  close(db);
}

downloadNotebooks();
