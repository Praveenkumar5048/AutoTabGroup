// Object to store tabId and their respective domain
const tabDomains = {};

// Object to store domains and their respective groupIds
const domainGroups = {};

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.url) {
        const fullUrl = new URL(changeInfo.url);
        const baseUrl = fullUrl.origin;

        const domain = extractDomain(changeInfo.url);
        tabDomains[tabId] = domain;

        const faviconUrl = `${baseUrl}/favicon.ico`;

        fetch(faviconUrl)
            .then(response => {
                if (response.ok) {
                    console.log('Favicon found:', faviconUrl);
                    fetchAndAnalyzeFavicon(faviconUrl)
                        .then(closestColor => 
                            manageTabGroupingColor(tabId, domain, closestColor))
                        .catch(error => manageTabGrouping(tabId, domain));
                } else {
                    console.log('Favicon not found at standard location:', faviconUrl);
                }
            })
            .catch(error => {
                console.error('Error fetching favicon:', error);
            });
    }
});

async function fetchAndAnalyzeFavicon(faviconUrl) {
    return fetch(faviconUrl)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok.');
            return response.blob();
        })
        .then(blob => createImageBitmap(blob))
        .then(imageBitmap => {
            const dominantColor = getDominantColor(imageBitmap);
            return findClosestColor(...dominantColor);
        });
}

function getDominantColor(imageBitmap) {
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const colors = {};
    for (let i = 0; i < data.length; i += 4) {
        const key = [data[i], data[i+1], data[i+2]].join(',');
        colors[key] = (colors[key] || 0) + 1;
    }

    let dominantColor = '';
    let maxCount = 0;
    for (let key in colors) {
        if (colors[key] > maxCount) {
            maxCount = colors[key];
            dominantColor = key;
        }
    }
    return dominantColor.split(',').map(x => parseInt(x));
}

function findClosestColor(r, g, b) {
    const colors = [
        {name: "grey", rgb: [128, 128, 128]},
        {name: "orange", rgb: [255, 165, 0]},
        {name: "pink", rgb: [255, 192, 203]},
        {name: "cyan", rgb: [0, 255, 255]},
        {name: "yellow", rgb: [255, 255, 0]},
        {name: "green", rgb: [0, 128, 0]},
        {name: "purple", rgb: [128, 0, 128]},
        {name: "blue", rgb: [0, 0, 255]},
        {name: "red", rgb: [255, 0, 0]}
    ];

    let minDistance = Infinity;
    let closestColor = null;

    colors.forEach(color => {
        let distance = Math.sqrt(
            Math.pow(color.rgb[0] - r, 2) +
            Math.pow(color.rgb[1] - g, 2) +
            Math.pow(color.rgb[2] - b, 2)
        );

        if (distance < minDistance) {
            minDistance = distance;
            closestColor = color.name;
        }
    });

    return closestColor;
}

// chrome.tabs.onCreated.addListener(function(tab) {
//     if (tab.url) {
//         const domain = extractDomain(tab.url);
//         tabDomains[tab.id] = domain;

//         manageTabGrouping(tab.id, domain);
//     }
// });

chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
    // Clean up our stored data when tabs are closed
    if (tabDomains[tabId]) {
        delete tabDomains[tabId];
    }
});

function manageTabGroupingColor(tabId, domain, closestColor) {
    if (domainGroups[domain]) {
        // Domain group already exists, add tab to it
        chrome.tabs.group({ groupId: domainGroups[domain], tabIds: tabId });
    } else {
        // Create a new group for this domain
        chrome.tabs.group({ tabIds: tabId }, function(groupId) {
            domainGroups[domain] = groupId;
            updateGroupName(groupId, domain);
            chrome.tabGroups.update(groupId, { color: closestColor });
        });
    }
}
function manageTabGrouping(tabId, domain) {
    if (domainGroups[domain]) {
        // Domain group already exists, add tab to it
        chrome.tabs.group({ groupId: domainGroups[domain], tabIds: tabId });
    } else {
        // Create a new group for this domain
        chrome.tabs.group({ tabIds: tabId }, function(groupId) {
            domainGroups[domain] = groupId;
            updateGroupName(groupId, domain);
        });
    }
}

function updateGroupName(groupId, domain) {
    let title = formatDomainAsTitle(domain);
    chrome.tabGroups.update(groupId, { title: title });
}

function formatDomainAsTitle(domain) {
    // Splits the domain on '.' and returns the first part as title, capitalized
    const title = domain.split('.')[0];
    return title.charAt(0).toUpperCase() + title.slice(1);
}

function extractDomain(url) {
    let domain;
    try {
        const urlObj = new URL(url);
        domain = urlObj.hostname;
        // Remove common subdomains if they exist
        if (domain.startsWith('www.')) {
            domain = domain.substring(4);
        }
    } catch (e) {
        console.error(`Error extracting domain from URL: ${url}`, e);
        domain = "unknown";
    }
    return domain;
}
