// Configuration constants
const CONFIG = {
    MOBILE_BREAKPOINT: '768px',
    SCROLL_DEBOUNCE_MS: 100,
    SCREEN_READER_CLEANUP_MS: 1000,
    INDENT_PER_LEVEL: 1,
    SCROLL_TRIGGER_POSITION: 3, // Divider for window.innerHeight
    SPECIAL_SECTIONS: ['glossary'],
    SPECIAL_SECTION_MAPPING: {
        'glossary': 'safety-security'
    },
    EXCLUDED_CONTAINERS: '.kpi-box, .explanatory-box, .legal-box, .disclaimer-box, .recital-box, .faq-box, .reference-box',
    BOX_SELECTORS: '.kpi-box, .explanatory-box, .legal-box, .disclaimer-box, .recital-box, .faq-box, .reference-box',
    TOAST_DURATION: 2000, // Duration in ms for toast notifications
    NAV_MANUAL_SCROLL_TIMEOUT: 2000, // Time to wait after manual nav scroll before auto-scrolling
    HEADER_SCROLL_THRESHOLD: 100, // Threshold for header scroll state
    DEFAULT_SECTION: 'summary', // Default section to show
    SCROLL_OFFSET: 100, // Offset for scrolling to anchors (header height + padding)
    SECTION_NAMES: {
        summary: 'Summary',
        transparency: 'Transparency',
        copyright: 'Copyright',
        'safety-security': 'Safety & Security'
    }
};

// Shared DOM elements
const elements = {
    nav: null,
    toggle: null,
    navContent: null,
    mainContent: null,
    boxes: null,
    sections: null,
    navTitle: null,
    sectionLinks: null
};

// Collection to store headline anchors for specified sections
const headlineAnchors = {
    transparency: [],
    copyright: [],
    'safety-security': []
};

// Internal reference mapping system
const internalReferenceMap = {
    commitments: new Map(),
    measures: new Map(),
    appendices: new Map()
};

// Track initial page load to handle scrolling properly
let isInitialPageLoad = true;

// URL handling utilities
function getSectionForAnchor(anchorId) {
    // Find which section contains this anchor
    const element = document.getElementById(anchorId);
    if (!element) return CONFIG.DEFAULT_SECTION;

    const section = element.closest('.content-section');
    return section ? section.getAttribute('data-section') : CONFIG.DEFAULT_SECTION;
}

function updateUrlWithSectionAndHash(section, hash = null) {
    const url = new URL(window.location.href);
    url.searchParams.set('section', section);
    if (hash) {
        url.hash = hash;
    } else {
        url.hash = '';
    }
    return url;
}

// Helper function to check if clipboard API is fully supported
function isClipboardWriteSupported() {
    return (
        navigator.clipboard &&
        navigator.clipboard.writeText &&
        navigator.permissions &&
        typeof navigator.permissions.query === 'function'
    );
}

// Helper function to safely copy text to clipboard with appropriate fallbacks
async function copyToClipboard(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('Clipboard API not supported');
    }

    try {
        // Try direct clipboard write without checking permissions first
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        console.error('Clipboard write failed:', error);
        throw error;
    }
}

// Function to show a toast notification
function showToast(message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    // Trigger reflow
    toast.offsetHeight;

    // Show the toast
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Remove the toast after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 200);
    }, CONFIG.TOAST_DURATION);
}

// Heading anchor system
function initializeHeadingAnchors() {
    // Get all headlines in main content, excluding those in special boxes
    const headlines = Array.from(document.querySelectorAll('.main-content h2, .main-content h3, .main-content h4, .main-content h5'))
        .filter(heading => !heading.closest(CONFIG.EXCLUDED_CONTAINERS));

    // Keep track of used IDs to ensure uniqueness
    const usedIds = new Set();

    headlines.forEach(heading => {
        // Generate base ID from text content
        let baseId = heading.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Ensure unique ID
        let uniqueId = baseId;
        let counter = 1;
        while (usedIds.has(uniqueId)) {
            uniqueId = `${baseId}-${++counter}`;
        }
        usedIds.add(uniqueId);

        // Set the unique ID
        heading.id = uniqueId;

        // Create anchor wrapper
        const anchor = document.createElement('a');
        anchor.className = 'heading-anchor';
        anchor.href = `#${uniqueId}`;

        // Move the heading's content into the anchor
        const headingContent = heading.textContent;
        heading.textContent = '';

        // Add Phosphor anchor icon
        const icon = document.createElement('i');
        icon.className = 'ph ph-link anchor-icon';
        anchor.appendChild(icon);

        // Add text
        const text = document.createElement('span');
        text.textContent = headingContent;
        anchor.appendChild(text);

        // Track headline anchors for specified sections
        const section = getSectionForAnchor(uniqueId);
        if (Object.keys(headlineAnchors).includes(section)) {
            headlineAnchors[section].push({
                id: uniqueId,
                text: headingContent,
                level: heading.tagName.toLowerCase()
            });
        }

        // Track if we're currently processing a click
        let isProcessing = false;

        // Add click handler
        anchor.addEventListener('click', async (e) => {
            e.preventDefault();

            // Prevent multiple simultaneous clicks
            if (isProcessing) {
                console.log('Preventing duplicate click processing');
                return;
            }

            isProcessing = true;
            const targetSection = getSectionForAnchor(uniqueId);
            const url = updateUrlWithSectionAndHash(targetSection, uniqueId);

            try {
                console.log('Attempting to copy URL:', url.toString());
                // Don't check permissions using the problematic API call
                await copyToClipboard(url.toString());
                showToast('Link copied to clipboard');
                showSection(targetSection, true, uniqueId);
            } catch (error) {
                console.error('Clipboard operation failed:', error);
                showToast('Failed to copy link');
            } finally {
                isProcessing = false;
            }
        });

        // Replace heading content with anchor
        heading.appendChild(anchor);
    });
}

// Initialize FAQ question anchors
function initializeFaqAnchors() {
    // Find all FAQ items
    const faqItems = document.querySelectorAll('.faq-item');

    // Keep track of used IDs to ensure uniqueness
    const usedIds = new Set();

    faqItems.forEach(item => {
        // Find the question paragraph with "Q:" prefix
        const questionPara = item.querySelector('p strong');
        if (!questionPara || !questionPara.textContent.trim().startsWith('Q:')) return;

        // Get the original text content
        const questionText = questionPara.textContent.trim();

        // Generate base ID from text content
        let baseId = 'faq-' + questionText
            .substring(2) // Remove "Q:" prefix
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+$/g, ''); // Remove trailing hyphens

        // Ensure unique ID
        let uniqueId = baseId;
        let counter = 1;
        while (usedIds.has(uniqueId)) {
            uniqueId = `${baseId}-${++counter}`;
        }
        usedIds.add(uniqueId);

        // Get all child elements in the FAQ item
        const allChildren = Array.from(item.children);

        // The first element is the question paragraph
        const questionElement = allChildren[0];

        // All other elements are part of the answer
        const answerElements = allChildren.slice(1);

        // Skip if no answer elements
        if (answerElements.length === 0) return;

        // Set up the structure
        item.innerHTML = '';

        // Create the question element with chevron
        const questionDiv = document.createElement('div');
        questionDiv.className = 'faq-question';
        questionDiv.setAttribute('role', 'button');
        questionDiv.setAttribute('aria-controls', `answer-${uniqueId}`);
        questionDiv.setAttribute('aria-expanded', 'false');

        // Add text
        const text = document.createElement('strong');
        text.textContent = questionText;
        text.id = uniqueId; // Set ID for anchor linking

        // Add chevron icon
        const caret = document.createElement('i');
        caret.className = 'ph ph-caret-right item-caret';
        caret.setAttribute('aria-hidden', 'true');

        // Add to question div
        questionDiv.appendChild(text);
        questionDiv.appendChild(caret);

        // Create answer container
        const answerDiv = document.createElement('div');
        answerDiv.className = 'faq-answer';
        answerDiv.id = `answer-${uniqueId}`;
        answerDiv.setAttribute('aria-hidden', 'true');

        // Add all answer elements to the answer div
        answerElements.forEach(element => {
            answerDiv.appendChild(element.cloneNode(true));
        });

        // Add anchor link to the answer
        const anchorLink = document.createElement('a');
        anchorLink.className = 'faq-link';
        anchorLink.href = `#${uniqueId}`;

        // Add icon
        const linkIcon = document.createElement('i');
        linkIcon.className = 'ph ph-link anchor-icon';

        // Add text
        const linkText = document.createTextNode('Link to this answer');

        // Append elements
        anchorLink.appendChild(linkIcon);
        anchorLink.appendChild(linkText);

        // Find the last paragraph in the answer and append the link to it
        const paragraphs = answerDiv.querySelectorAll('p');
        if (paragraphs.length > 0) {
            paragraphs[paragraphs.length - 1].appendChild(anchorLink);
        } else {
            // Fallback if no paragraphs
            answerDiv.appendChild(anchorLink);
        }

        // Add click handler for question
        questionDiv.addEventListener('click', () => {
            const isExpanded = item.classList.toggle('expanded');
            item.setAttribute('aria-expanded', isExpanded);
            answerDiv.setAttribute('aria-hidden', !isExpanded);
        });

        // Add click handler for anchor link
        anchorLink.addEventListener('click', async (e) => {
            e.preventDefault();

            // Ensure the FAQ item and parent box are expanded
            item.classList.add('expanded');
            const faqBox = item.closest('.faq-box');
            if (faqBox && faqBox.classList.contains('collapsed')) {
                // Use existing toggleBox function to expand the FAQ box
                toggleBox(faqBox, true);
            }

            const targetSection = getSectionForAnchor(uniqueId);
            const url = updateUrlWithSectionAndHash(targetSection, uniqueId);

            try {
                // Don't check permissions using the problematic API call
                await copyToClipboard(url.toString());
                showToast('Link copied to clipboard');
                showSection(targetSection, true, uniqueId);
            } catch (error) {
                console.error('Clipboard operation failed:', error);
                showToast('Failed to copy link');
            }
        });

        // Append to item
        item.appendChild(questionDiv);
        item.appendChild(answerDiv);
    });
}

// Initialize anchors for strong elements in the Safety and Security explainer
function initializeStrongElementAnchors() {
    // Select the explanatory box about Safety and Security section - find by heading text
    const explanatoryBoxes = document.querySelectorAll('.explanatory-box h4');
    let targetBox = null;

    // Find the specific explanatory box with the Safety and Security title
    for (const heading of explanatoryBoxes) {
        if (heading.textContent.includes('Explainer: About the Safety and Security Section of the Code')) {
            targetBox = heading.closest('.explanatory-box');
            break;
        }
    }

    if (!targetBox) {
        console.log('Safety and Security explanatory box not found');
        return;
    }

    // Find all strong elements in this specific explanatory box
    const strongElements = targetBox.querySelectorAll('p > strong');

    // Keep track of used IDs to ensure uniqueness
    const usedIds = new Set();

    strongElements.forEach(strongEl => {
        // Generate base ID from text content
        let baseId = 'explainer-' + strongEl.textContent.trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/-+$/g, ''); // Remove trailing hyphens

        // Ensure unique ID
        let uniqueId = baseId;
        let counter = 1;
        while (usedIds.has(uniqueId)) {
            uniqueId = `${baseId}-${++counter}`;
        }
        usedIds.add(uniqueId);

        // Set the unique ID to the parent paragraph
        const parentParagraph = strongEl.closest('p');
        if (parentParagraph) {
            parentParagraph.id = uniqueId;

            // Create anchor wrapper
            const strongText = strongEl.textContent;
            strongEl.innerHTML = '';

            // Create anchor element
            const anchor = document.createElement('a');
            anchor.className = 'strong-anchor';
            anchor.href = `#${uniqueId}`;
            anchor.textContent = strongText;

            // Add Phosphor anchor icon
            const icon = document.createElement('i');
            icon.className = 'ph ph-link anchor-icon';
            anchor.insertBefore(icon, anchor.firstChild);

            // Track if we're currently processing a click
            let isProcessing = false;

            // Add click handler
            anchor.addEventListener('click', async (e) => {
                e.preventDefault();

                // Prevent multiple simultaneous clicks
                if (isProcessing) {
                    console.log('Preventing duplicate click processing');
                    return;
                }

                isProcessing = true;
                const targetSection = getSectionForAnchor(uniqueId);
                const url = updateUrlWithSectionAndHash(targetSection, uniqueId);

                try {
                    console.log('Attempting to copy URL:', url.toString());
                    // Don't check permissions using the problematic API call
                    await copyToClipboard(url.toString());
                    showToast('Link copied to clipboard');
                    showSection(targetSection, true, uniqueId);
                } catch (error) {
                    console.error('Clipboard operation failed:', error);
                    showToast('Failed to copy link');
                } finally {
                    isProcessing = false;
                }
            });

            // Replace strong content with anchor
            strongEl.appendChild(anchor);
        }
    });
}

// Helper function for screen reader announcements
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('class', 'sr-only');
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), CONFIG.SCREEN_READER_CLEANUP_MS);
}

// Helper function for scrolling to elements with offset
function scrollToElementWithOffset(element, behavior = 'smooth') {
    if (!element) return;

    const headerOffset = CONFIG.SCROLL_OFFSET;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

    window.scrollTo({
        top: offsetPosition,
        behavior
    });
}

// Function to show a specific section
function showSection(sectionId, updateUrl = true, scrollToHash = null) {
    // Reset the currently active heading ID when changing sections
    currentActiveHeadingId = null;

    // Hide all sections and remove active class from nav links
    elements.sections.forEach(section => section.classList.remove('active'));
    elements.sectionLinks.forEach(link => link.classList.remove('active'));

    // Validate sectionId to ensure it's a valid section
    if (!sectionId || typeof sectionId !== 'string') {
        sectionId = CONFIG.DEFAULT_SECTION;
    }

    // Show the target section
    const targetSection = document.querySelector(`[data-section="${sectionId}"]`);
    if (!targetSection) {
        // If section not found, default to the first section
        const firstSection = document.querySelector('.content-section');
        if (firstSection) {
            sectionId = firstSection.getAttribute('data-section') || CONFIG.DEFAULT_SECTION;
            return showSection(sectionId, updateUrl, scrollToHash);
        }
        return;
    }

    targetSection.classList.add('active');

    // Update nav links
    elements.sectionLinks.forEach(link => {
        const href = link.getAttribute('href');
        const linkSectionId = href.startsWith('?') ? new URLSearchParams(href).get('section') : href.substring(1);

        if (linkSectionId === sectionId) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        }
    });

    // Update nav title
    if (elements.navTitle) {
        elements.navTitle.textContent = `Table of Contents: ${CONFIG.SECTION_NAMES[sectionId]}`;
    }

    // Update URL if requested
    if (updateUrl) {
        const url = updateUrlWithSectionAndHash(sectionId, scrollToHash);
        history.pushState({ section: sectionId, hash: scrollToHash }, '', url.toString());
    }

    // Rebuild navigation with only the headers from this section
    buildNavigation(targetSection);

    // If hash starts with "faq-", find and expand the associated FAQ box
    if (scrollToHash && scrollToHash.startsWith('faq-')) {
        setTimeout(() => {
            const faqElement = document.getElementById(scrollToHash);
            if (faqElement) {
                // Find the closest parent FAQ box
                const faqBox = faqElement.closest('.faq-box');
                if (faqBox && faqBox.classList.contains('collapsed')) {
                    // Open the box directly instead of calling toggleBox
                    faqBox.setAttribute('aria-expanded', 'true');
                    faqBox.classList.remove('collapsed');

                    // Show all content elements
                    const header = faqBox.querySelector('h4, h5');
                    Array.from(faqBox.children).forEach(child => {
                        if (child !== header) {
                            child.style.display = 'block';
                        }
                    });
                }

                // Find and expand the specific FAQ item
                const faqItem = faqElement.closest('.faq-item');
                if (faqItem) {
                    faqItem.classList.add('expanded');
                }

                // Scroll to the question with offset
                scrollToElementWithOffset(faqElement);
            }
        }, 50);
    }

    // Handle scrolling
    if (scrollToHash) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            const element = document.getElementById(scrollToHash);
            if (element) {
                scrollToElementWithOffset(element);

                // Update the active nav item to match the hash
                setTimeout(() => {
                    // Find the navigation link matching the hash
                    const navLink = elements.navContent.querySelector(`a[href="#${scrollToHash}"]`);
                    if (navLink) {
                        // Remove active class from all links
                        elements.navContent.querySelectorAll('a').forEach(link => {
                            link.classList.remove('active');
                            // Remove existing bookmark icon if any
                            const existingBookmark = link.querySelector('.nav-bookmark');
                            if (existingBookmark) {
                                existingBookmark.remove();
                            }
                        });

                        // Add active class to the matching link
                        navLink.classList.add('active');

                        // Update the current active heading ID for keyboard navigation
                        currentActiveHeadingId = scrollToHash;

                        // Add bookmark icon
                        const bookmark = document.createElement('i');
                        bookmark.className = 'ph-duotone ph-bookmark-simple nav-bookmark';
                        navLink.insertBefore(bookmark, navLink.firstChild);

                        // Scroll the nav link into view
                        navLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 150);
            }
        }, 100);
    } else {
        window.scrollTo({
            top: 0,
            behavior: 'auto' // Instant scroll when changing sections
        });

        // Also reset the nav content scroll position
        if (elements.navContent) {
            elements.navContent.scrollTop = 0;
        }
    }

    // Announce to screen readers
    announceToScreenReader(`Showing ${CONFIG.SECTION_NAMES[sectionId]} section${scrollToHash ? ' and scrolling to requested position' : ''}`);
}

// Function to build navigation
function buildNavigation(container = elements.mainContent) {
    const navList = document.createElement('ul');
    navList.setAttribute('role', 'navigation');
    navList.setAttribute('aria-label', 'Document sections');

    // Ensure we're using a valid container
    if (!container || !container.querySelector) {
        // If container is invalid, use the active section instead
        const activeSection = document.querySelector('.content-section.active');
        if (activeSection) {
            container = activeSection;
        } else {
            container = elements.mainContent;
        }
    }

    // Get all headlines from the specified container, excluding those in special boxes
    const headlines = Array.from(container.querySelectorAll('h2, h3, h4'))
        .filter(heading => !heading.closest(CONFIG.EXCLUDED_CONTAINERS));

    headlines.forEach(heading => {
        const level = parseInt(heading.tagName[1]) - 1;

        // Create unique ID if needed
        if (!heading.id) {
            heading.id = heading.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }

        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#${heading.id}`;

        // Transform text for navigation
        let text = heading.textContent.trim();
        text = text.replace(/^Measure\s+([IVXLCDM]+\.\d+(?:\.\d+)*)/i, 'M $1');
        text = text.replace(/^Commitment\s+([IVXLCDM]+\.\d+(?:\.\d+)*)/i, 'C $1');
        text = text.replace(/^Appendix\s+(\d+(?:\.\d+)*)/i, 'A $1');
        link.textContent = text;

        link.style.paddingLeft = `${(level - 1) * CONFIG.INDENT_PER_LEVEL}rem`;

        li.appendChild(link);
        navList.appendChild(li);
    });

    // Add special sections if they belong to the current section
    const currentSection = container.getAttribute('data-section');
    if (currentSection) {
        CONFIG.SPECIAL_SECTIONS.forEach(id => {
            if (CONFIG.SPECIAL_SECTION_MAPPING[id] === currentSection) {
                const section = document.getElementById(id);
                if (section) {
                    const li = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = `#${id}`;
                    link.textContent = id === 'glossary' ? 'Glossary' : id;
                    link.style.paddingLeft = '0';
                    li.appendChild(link);
                    navList.appendChild(li);
                }
            }
        });
    }

    elements.navContent.innerHTML = '';
    elements.navContent.appendChild(navList);

    // Reset nav scroll to the top when building a new navigation
    elements.navContent.scrollTop = 0;
}

/**
 * Safari-specific fix to ensure balanced layout with equal spacing
 * between screen edges and content elements
 * More robust than the CSS-only approach with better diagnostics
 */
function applySafariContentFix() {
    try {
        // Return early if on mobile/small screens
        const isMobileOrTablet = window.matchMedia('(max-width: 1024px)').matches;
        if (isMobileOrTablet) {
            // Mobile positioning is handled by CSS
            return;
        }

        // Multi-layer Safari detection for reliability
        const detectionResults = {
            // Method 1: User agent string pattern matching
            uaContainsSafari: /safari/i.test(navigator.userAgent || ''),
            uaNotContainsChrome: !/chrome|chromium/i.test(navigator.userAgent || ''),
            uaAppleWebKit: /applewebkit/i.test(navigator.userAgent || ''),

            // Method 2: Vendor check
            vendorIsApple: /apple/i.test(navigator.vendor || ''),

            // Method 3: Feature detection for Safari-specific CSS properties
            hasSafariPushState: typeof window.history.pushState === 'function' &&
                (navigator.userAgent || '').indexOf('Safari') > -1 &&
                (navigator.userAgent || '').indexOf('Chrome') === -1,

            // Method 4: Platform detection for likely Safari environments
            isOnMac: /mac/i.test(navigator.platform || ''),
            isOnIOS: /iphone|ipad|ipod/i.test(navigator.userAgent || ''),
        };

        // Combine detection methods for improved accuracy
        const isSafariMethod1 = detectionResults.uaContainsSafari &&
            detectionResults.uaNotContainsChrome;

        const isSafariMethod2 = detectionResults.uaAppleWebKit &&
            detectionResults.vendorIsApple &&
            !detectionResults.uaContainsChrome;

        const isSafariMethod3 = detectionResults.hasSafariPushState;

        const isSafariMethod4 = (detectionResults.isOnMac || detectionResults.isOnIOS) &&
            detectionResults.uaAppleWebKit &&
            !detectionResults.uaContainsChrome;

        // Final determination - requires at least three methods to agree
        const isSafari = [isSafariMethod1, isSafariMethod2, isSafariMethod3, isSafariMethod4]
            .filter(Boolean).length >= 3;

        if (!isSafari) {
            console.log(`[Safari Fix] ${new Date().toISOString()} - Not detected as Safari, no fix needed`);
            return;
        }

        // Get elements and measurements
        const mainContent = document.querySelector('.main-content');
        const sideNav = document.querySelector('.side-nav');
        const headerText = document.querySelector('.header-text');

        if (!mainContent || !sideNav) {
            console.log(`[Safari Fix] ${new Date().toISOString()} - Required elements not found:`, {
                mainContent: !!mainContent,
                sideNav: !!sideNav,
                headerText: !!headerText
            });
            return;
        }

        // Get viewport width
        const viewportWidth = document.documentElement.clientWidth;

        // Get element measurements
        const mainContentRect = mainContent.getBoundingClientRect();
        const sideNavRect = sideNav.getBoundingClientRect();
        const headerRect = headerText ? headerText.getBoundingClientRect() : null;

        // Calculate current layout measurements
        const leftSpacing = mainContentRect.left;
        const rightSpacing = viewportWidth - sideNavRect.right;
        const contentToNavGap = sideNavRect.left - mainContentRect.right;

        // Calculate the ideal balanced layout
        const targetLeftSpacing = Math.max(leftSpacing, rightSpacing);
        const targetRightSpacing = targetLeftSpacing;
        const targetContentToNavGap = 40; // Minimum space between content and nav

        // Get computed styles for diagnostic purposes
        const computedMainContentStyle = window.getComputedStyle(mainContent);
        const computedSideNavStyle = window.getComputedStyle(sideNav);

        console.log(`[Safari Fix] ${new Date().toISOString()} - Current layout:`, {
            viewportWidth,
            leftSpacing,
            rightSpacing,
            contentToNavGap,
            targetLeftSpacing,
            targetRightSpacing,
            targetContentToNavGap,
            mainContentRect,
            sideNavRect,
            styles: {
                mainContent: {
                    width: computedMainContentStyle.width,
                    maxWidth: computedMainContentStyle.maxWidth,
                    margin: {
                        left: computedMainContentStyle.marginLeft,
                        right: computedMainContentStyle.marginRight
                    }
                },
                sideNav: {
                    width: computedSideNavStyle.width,
                    right: computedSideNavStyle.right
                }
            }
        });

        // Calculate adjustments needed
        const needsBalancingFix = Math.abs(leftSpacing - rightSpacing) > 5; // Allow small differences
        const hasInsufficientGap = contentToNavGap < targetContentToNavGap;

        if (needsBalancingFix || hasInsufficientGap) {
            // Calculate new margins to create balanced spacing
            const currentLeftMargin = parseInt(computedMainContentStyle.marginLeft) || 0;
            const currentRightMargin = parseInt(computedMainContentStyle.marginRight) || 0;

            // Calculate total available space for content
            const availableWidth = viewportWidth - (2 * targetLeftSpacing) - sideNavRect.width - targetContentToNavGap;

            // If using CSS Grid, adjust margins; otherwise adjust width
            if (window.getComputedStyle(document.body).display === 'grid') {
                // For grid layout, adjust margins
                const newLeftMargin = targetLeftSpacing - mainContentRect.left + currentLeftMargin;
                const newRightMargin = targetContentToNavGap;

                // Validate calculated values
                if (!isNaN(newLeftMargin) && newLeftMargin >= 0 && newLeftMargin < 500 &&
                    !isNaN(newRightMargin) && newRightMargin >= 0 && newRightMargin < 500) {
                    console.log(`[Safari Fix] ${new Date().toISOString()} - Applying grid layout fix:`, {
                        newLeftMargin,
                        newRightMargin
                    });

                    mainContent.style.marginLeft = `${newLeftMargin}px`;
                    mainContent.style.marginRight = `${newRightMargin}px`;
                }
            } else {
                // For non-grid layouts, adjust max-width
                const currentWidth = mainContentRect.width;
                const newWidth = Math.min(currentWidth, availableWidth);

                if (!isNaN(newWidth) && newWidth > 0 && newWidth < viewportWidth) {
                    console.log(`[Safari Fix] ${new Date().toISOString()} - Applying width fix:`, {
                        currentWidth,
                        newWidth,
                        maxWidth: `${newWidth}px`
                    });

                    mainContent.style.maxWidth = `${newWidth}px`;
                    mainContent.style.marginLeft = 'auto';
                    mainContent.style.marginRight = 'auto';
                }
            }

            // Verify fix was applied correctly after a short delay
            setTimeout(() => {
                try {
                    const updatedContentRect = mainContent.getBoundingClientRect();
                    const updatedLeftSpacing = updatedContentRect.left;
                    const updatedRightSpacing = viewportWidth - sideNavRect.right;
                    const updatedContentToNavGap = sideNavRect.left - updatedContentRect.right;

                    console.log(`[Safari Fix] ${new Date().toISOString()} - Fix verification:`, {
                        before: {
                            leftSpacing,
                            rightSpacing,
                            contentToNavGap
                        },
                        after: {
                            leftSpacing: updatedLeftSpacing,
                            rightSpacing: updatedRightSpacing,
                            contentToNavGap: updatedContentToNavGap
                        },
                        success: Math.abs(updatedLeftSpacing - updatedRightSpacing) <= 5 &&
                            updatedContentToNavGap >= targetContentToNavGap
                    });

                    // If fix didn't work, try alternative approach
                    if (Math.abs(updatedLeftSpacing - updatedRightSpacing) > 5 ||
                        updatedContentToNavGap < targetContentToNavGap) {
                        console.warn(`[Safari Fix] ${new Date().toISOString()} - Primary fix insufficient, trying alternative`);

                        // Simple fallback approach - ensure minimum gap and center content
                        const safeGap = targetContentToNavGap + 10; // Add a buffer
                        mainContent.style.maxWidth = `calc(100% - ${sideNavRect.width}px - ${safeGap}px - ${leftSpacing}px)`;
                        mainContent.style.marginLeft = `${leftSpacing}px`;
                        mainContent.style.marginRight = `${safeGap}px`;
                    }
                } catch (verificationError) {
                    console.error(`[Safari Fix] ${new Date().toISOString()} - Error during verification:`, verificationError);
                }
            }, 50);
        } else {
            console.log(`[Safari Fix] ${new Date().toISOString()} - Layout already balanced, no fix needed`);
        }
    } catch (error) {
        // Catch any unexpected errors to prevent breaking the page
        console.error(`[Safari Fix] ${new Date().toISOString()} - Critical error:`, error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Sync scroll offset with CSS
    document.documentElement.style.setProperty('--scroll-margin-top', `${CONFIG.SCROLL_OFFSET}px`);

    // Initialize various modules
    elements.nav = document.querySelector('.side-nav');
    elements.toggle = document.querySelector('.nav-toggle');
    elements.navContent = document.getElementById('nav-content');
    elements.mainContent = document.querySelector('.main-content');
    elements.boxes = document.querySelectorAll(CONFIG.BOX_SELECTORS);
    elements.sections = document.querySelectorAll('.content-section');
    elements.navTitle = document.querySelector('.nav-title');
    elements.sectionLinks = document.querySelectorAll('.header-nav-expanded a, .header-nav-collapsed a');

    // Initialize heading anchors and build internal reference maps
    initializeHeadingAnchors();
    buildInternalReferenceMaps();

    // Process content for internal references
    if (elements.mainContent) {
        processContentForInternalReferences(elements.mainContent);
    }

    // Update active section in header nav on page load
    setTimeout(() => {
        const activeSection = document.querySelector('.content-section.active');
        if (activeSection) {
            const activeSectionId = activeSection.getAttribute('data-section');
            elements.sectionLinks.forEach(link => {
                const href = link.getAttribute('href');
                const linkSectionId = href.startsWith('?') ? new URLSearchParams(href).get('section') : href.substring(1);

                if (linkSectionId === activeSectionId) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        }
    }, 0);

    // Handle section navigation clicks
    elements.sectionLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            const sectionId = href.startsWith('?') ? new URLSearchParams(href).get('section') : href.substring(1);
            const url = updateUrlWithSectionAndHash(sectionId);
            history.pushState({ section: sectionId }, '', url.toString());
            showSection(sectionId);
            toggleMenu(false); // Close mobile menu if open
        });
    });

    // Handle initial URL
    const url = new URL(window.location.href);
    const hash = url.hash.substring(1);
    const sectionParam = url.searchParams.get('section');

    let targetSection = CONFIG.DEFAULT_SECTION;

    if (sectionParam) {
        // Use explicitly provided section parameter if available
        targetSection = sectionParam;
    } else if (hash) {
        // Otherwise try to find which section contains the hash
        targetSection = getSectionForAnchor(hash);
    }

    // Wait for DOM to be fully ready before scrolling
    setTimeout(() => {
        showSection(targetSection, true, hash);

        // Additional scroll after a short delay to ensure everything is rendered
        if (hash) {
            setTimeout(() => {
                const element = document.getElementById(hash);
                if (element) {
                    element.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
            }, 100);
        }

        // Set initial page load to false after a delay
        setTimeout(() => {
            isInitialPageLoad = false;
        }, 1000);
    }, 0);

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
        const url = new URL(window.location.href);
        const hash = url.hash.substring(1);
        const sectionParam = url.searchParams.get('section');

        let targetSection = CONFIG.DEFAULT_SECTION;

        if (sectionParam) {
            // Use explicitly provided section parameter if available
            targetSection = sectionParam;
        } else if (hash) {
            // Otherwise try to find which section contains the hash
            targetSection = getSectionForAnchor(hash);
        }

        showSection(targetSection, false, hash);
    });

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Function to toggle menu
    function toggleMenu(force = null) {
        const isExpanded = force !== null ? force : elements.toggle.getAttribute('aria-expanded') === 'true';
        const newState = force !== null ? force : !isExpanded;

        elements.toggle.setAttribute('aria-expanded', newState);
        elements.nav.classList.toggle('is-open', newState);

        // Announce to screen readers
        announceToScreenReader(`Navigation menu ${newState ? 'opened' : 'closed'}`);

        // Prevent body scroll when nav is open on mobile
        if (window.matchMedia(`(max-width: ${CONFIG.MOBILE_BREAKPOINT})`).matches) {
            document.body.style.overflow = newState ? 'hidden' : '';
        }
    }

    // Update active navigation item
    let lastNavScrollTime = 0;
    let isUpdatingNav = false;

    function updateActiveNavItem() {
        if (isUpdatingNav) return;
        isUpdatingNav = true;

        requestAnimationFrame(() => {
            // Use scroll offset for determining active item
            const scrollPosition = window.scrollY + window.innerHeight / CONFIG.SCROLL_TRIGGER_POSITION - CONFIG.SCROLL_OFFSET;

            const activeSection = document.querySelector('.content-section.active');

            // Update active state in the header navigation
            if (activeSection) {
                const activeSectionId = activeSection.getAttribute('data-section');
                elements.sectionLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    const linkSectionId = href.startsWith('?') ? new URLSearchParams(href).get('section') : href.substring(1);

                    if (linkSectionId === activeSectionId) {
                        link.classList.add('active');
                        link.setAttribute('aria-current', 'page');
                    } else {
                        link.classList.remove('active');
                        link.removeAttribute('aria-current');
                    }
                });
            }

            const headlines = Array.from((activeSection || elements.mainContent).querySelectorAll('h2, h3, h4'))
                .filter(heading => !heading.closest(CONFIG.EXCLUDED_CONTAINERS))
                .map(heading => ({
                    element: heading,
                    position: heading.getBoundingClientRect().top + window.scrollY
                }))
                .filter(item => item.position <= scrollPosition);

            const activeHeadline = headlines[headlines.length - 1];
            let activeLink = null;

            elements.navContent.querySelectorAll('a').forEach(link => {
                link.classList.remove('active');
                // Remove existing bookmark icon if any
                const existingBookmark = link.querySelector('.nav-bookmark');
                if (existingBookmark) {
                    existingBookmark.remove();
                }

                if (activeHeadline && link.getAttribute('href') === `#${activeHeadline.element.id}`) {
                    link.classList.add('active');
                    activeLink = link;
                    // Add bookmark icon
                    const bookmark = document.createElement('i');
                    bookmark.className = 'ph-duotone ph-bookmark-simple nav-bookmark';
                    link.insertBefore(bookmark, link.firstChild);
                }
            });

            // Scroll active item into view if needed - with a delay on first page load
            if (activeLink && Date.now() - lastNavScrollTime > CONFIG.NAV_MANUAL_SCROLL_TIMEOUT) {
                const navContainer = elements.navContent;
                const linkRect = activeLink.getBoundingClientRect();
                const containerRect = navContainer.getBoundingClientRect();

                if (linkRect.top < containerRect.top || linkRect.bottom > containerRect.bottom) {
                    // Add a delay for the initial page load to avoid conflicting with main content scrolling
                    const delay = isInitialPageLoad ? 500 : 0;
                    setTimeout(() => {
                        activeLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, delay);
                }
            }

            isUpdatingNav = false;
        });
    }

    // Track manual nav scrolling
    elements.navContent.addEventListener('scroll', () => {
        lastNavScrollTime = Date.now();
    });

    // Handle scroll without debounce
    window.addEventListener('scroll', updateActiveNavItem, { passive: true });

    // Track the currently active heading to improve keyboard navigation
    let currentActiveHeadingId = null;

    // Update the current active heading ID when the active nav item changes
    const originalUpdateActiveNavItem = updateActiveNavItem;
    updateActiveNavItem = function () {
        originalUpdateActiveNavItem();
        // Update current heading ID based on active nav link
        const activeNavLink = document.querySelector('.nav-link.active');
        if (activeNavLink) {
            currentActiveHeadingId = activeNavLink.getAttribute('href').substring(1);
        }
    };

    // Update keyboard navigation to ensure nav highlighting
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            requestAnimationFrame(updateActiveNavItem);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            // Check if gallery is open
            const galleryOverlay = document.getElementById('gallery-overlay');
            if (galleryOverlay && galleryOverlay.classList.contains('active')) {
                e.preventDefault();
                navigateGallery(e.key === 'ArrowRight' ? 'next' : 'prev');
                return;
            }

            e.preventDefault();

            // Get the active section
            const activeSection = document.querySelector('.content-section.active');
            if (!activeSection) return;

            // Get all visible headings in document order from the active section
            const headlines = Array.from(activeSection.querySelectorAll('h2, h3, h4'))
                .filter(heading => {
                    // Filter out headings in excluded containers and those not visible
                    const isInExcludedContainer = heading.closest(CONFIG.EXCLUDED_CONTAINERS);
                    // Check if the heading is visible in the DOM
                    const rect = heading.getBoundingClientRect();
                    const hasSize = rect.width > 0 && rect.height > 0;
                    const style = window.getComputedStyle(heading);
                    const isVisible = style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0' &&
                        hasSize;
                    return !isInExcludedContainer && isVisible;
                });

            if (!headlines.length) return;

            // Find index of current heading - first try using the tracked ID
            let currentIndex = -1;

            if (currentActiveHeadingId) {
                // Check if the element exists and is visible in this section
                const currentHeading = activeSection.querySelector(`#${currentActiveHeadingId}`);
                if (currentHeading) {
                    // Check if it appears in our headlines array (meaning it's visible and valid)
                    currentIndex = headlines.findIndex(h => h.id === currentActiveHeadingId);
                }
            }

            // If no current heading is tracked, find the one closest to viewport
            if (currentIndex === -1) {
                const viewportMiddle = window.scrollY + (window.innerHeight / 2);

                let closestIndex = 0;
                let closestDistance = Number.MAX_SAFE_INTEGER;

                // Find the heading closest to the middle of the viewport
                for (let i = 0; i < headlines.length; i++) {
                    const headingRect = headlines[i].getBoundingClientRect();
                    const headingMiddle = headingRect.top + (headingRect.height / 2);
                    const distanceToMiddle = Math.abs(headingMiddle - (window.innerHeight / 2));

                    if (distanceToMiddle < closestDistance) {
                        closestDistance = distanceToMiddle;
                        closestIndex = i;
                    }
                }

                currentIndex = closestIndex;

                // Ensure currentIndex is valid
                currentIndex = Math.max(0, Math.min(currentIndex, headlines.length - 1));
            }

            // Calculate target index
            const targetIndex = e.key === 'ArrowRight'
                ? Math.min(currentIndex + 1, headlines.length - 1)
                : Math.max(currentIndex - 1, 0);

            // Only scroll if we're moving to a different heading
            if (targetIndex !== currentIndex) {
                const targetHeading = headlines[targetIndex];
                scrollToElementWithOffset(targetHeading);

                // Update the current active heading ID
                currentActiveHeadingId = targetHeading.id;

                // Update URL and nav highlighting
                if (targetHeading.id) {
                    history.pushState(null, '', `#${targetHeading.id}`);
                    requestAnimationFrame(updateActiveNavItem);
                }
            }
        }
    });

    // Update scroll to top to ensure nav highlighting
    function scrollToTop() {
        // Reset nav scroll first
        elements.navContent.scrollTo({
            top: 0,
            behavior: 'smooth'
        });

        // Scroll to the top of the main content or header
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });

        requestAnimationFrame(updateActiveNavItem);
    }

    // Event Listeners
    elements.toggle.addEventListener('click', () => toggleMenu());

    document.addEventListener('click', (e) => {
        if (!elements.nav.contains(e.target) && !elements.toggle.contains(e.target)) {
            toggleMenu(false);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            toggleMenu(false);
        } else if (e.key === '0') {
            toggleMenu();
        }
    });

    // Handle navigation link clicks
    elements.navContent.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link) {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                // Update the current active heading ID for keyboard navigation
                currentActiveHeadingId = targetId;

                scrollToElementWithOffset(targetElement);
                // Update URL without scrolling
                history.pushState(null, '', `#${targetId}`);
                toggleMenu(false);
            }
        }
    });

    // Initialize
    initializeHeadingAnchors();
    initializeFaqAnchors();
    initializeStrongElementAnchors();
    buildNavigation();
    updateActiveNavItem();

    // Handle responsive behavior
    const mediaQuery = window.matchMedia(`(min-width: ${CONFIG.MOBILE_BREAKPOINT})`);

    // Set initial state
    toggleMenu(mediaQuery.matches);

    // Handle resize
    mediaQuery.addEventListener('change', (e) => {
        toggleMenu(e.matches);
        if (e.matches) {
            document.body.style.overflow = ''; // Ensure scroll is enabled
        }
    });

    // Function to toggle a single box
    function toggleBox(box, force = null) {
        const isExpanded = force !== null ? force : box.getAttribute('aria-expanded') === 'true';
        const newState = force !== null ? force : !isExpanded;

        box.setAttribute('aria-expanded', newState);
        box.classList.toggle('collapsed', !newState);

        // Get the content element (everything after the header)
        const header = box.querySelector('h4, h5') || box.querySelector('::before');
        const content = Array.from(box.children).filter(child => {
            // For recital boxes, we want all elements except the pseudo-elements
            if (box.classList.contains('recital-box')) {
                return true;
            }
            // For other boxes, exclude the header
            return child !== header;
        });

        content.forEach(el => {
            el.style.display = newState ? 'block' : 'none';
        });

        // Announce to screen readers
        const boxType = box.classList.contains('recital-box') ?
            `Recital ${box.getAttribute('data-recital')}` :
            header?.textContent;
        announceToScreenReader(`${boxType} ${newState ? 'expanded' : 'collapsed'}`);
    }

    // Function to toggle all boxes
    function toggleAllBoxes(force = null) {
        elements.boxes.forEach(box => {
            toggleBox(box, force);
        });
    }

    // Initialize boxes
    elements.boxes.forEach(box => {
        const header = box.querySelector('h4, h5');
        const isRecital = box.classList.contains('recital-box');

        // Skip collapsing for boxes with keep-open-initially class
        const keepExpandedInitially = box.classList.contains('keep-open-initially');

        if (!keepExpandedInitially) {
            // Initialize aria-expanded attribute to false (collapsed)
            box.setAttribute('aria-expanded', 'false');
            box.classList.add('collapsed');

            // Hide content initially
            const content = Array.from(box.children).filter(child => {
                if (isRecital) return true;
                return child !== header;
            });
            content.forEach(el => el.style.display = 'none');
        } else {
            // Set expanded state for boxes that should start expanded
            box.setAttribute('aria-expanded', 'true');
        }

        if (isRecital) {
            // For recital boxes, make the entire box clickable
            box.addEventListener('click', () => toggleBox(box));
        } else if (header) {
            // For other boxes, make the header clickable
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => toggleBox(box));
        }
    });

    // Add keyboard shortcut for toggling all boxes
    document.addEventListener('keydown', (e) => {
        if (e.key === '2') {
            e.preventDefault();
            toggleAllBoxes();
        } else if (e.key === '3') {
            scrollToTop();
        } else if (e.key === '1') {
            themeToggle.click();
        }
    });

    // Add click handler for "To top" button
    document.querySelector('.shortcut-btn[data-key="3"]').addEventListener('click', scrollToTop);

    // Add click handler for footer nose button
    document.querySelector('.footer-nose-btn').addEventListener('click', scrollToTop);

    // Add click handler for "Toggle boxes" button
    document.querySelector('.shortcut-btn[data-key="2"]').addEventListener('click', (e) => {
        e.preventDefault();
        toggleAllBoxes();
    });

    // Handle header scroll state
    const header = document.querySelector('.main-header');
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
        const currentScrollY = window.scrollY;

        // Add/remove scrolled class based on scroll position
        if (currentScrollY > CONFIG.HEADER_SCROLL_THRESHOLD) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }

        lastScrollY = currentScrollY;
    };

    // Add scroll listener with passive flag for better performance
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Initial check
    handleScroll();

    // Gallery functionality
    const galleryItems = document.querySelectorAll('.gallery-item');
    const galleryOverlay = document.getElementById('gallery-overlay');
    const overlayImage = document.getElementById('gallery-overlay-image');
    const closeButton = document.querySelector('.gallery-close-btn');
    const prevButton = document.querySelector('.gallery-prev-btn');
    const nextButton = document.querySelector('.gallery-next-btn');

    // Track current image index
    let currentImageIndex = 0;

    // Function to open the gallery overlay
    function openGallery(imageSrc, index) {
        if (galleryOverlay && overlayImage) {
            overlayImage.src = imageSrc;
            currentImageIndex = index;
            updateNavigationButtons();
            galleryOverlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent scrolling when overlay is open
        }
    }

    // Function to close the gallery overlay
    function closeGallery() {
        if (galleryOverlay) {
            galleryOverlay.classList.remove('active');
            document.body.style.overflow = ''; // Restore scrolling
        }
    }

    // Function to update navigation buttons state
    function updateNavigationButtons() {
        if (prevButton) {
            prevButton.style.display = currentImageIndex === 0 ? 'none' : 'flex';
        }
        if (nextButton) {
            nextButton.style.display = currentImageIndex === galleryItems.length - 1 ? 'none' : 'flex';
        }
    }

    // Function to navigate to next/previous image
    function navigateGallery(direction) {
        const newIndex = direction === 'next'
            ? Math.min(currentImageIndex + 1, galleryItems.length - 1)
            : Math.max(currentImageIndex - 1, 0);

        if (newIndex !== currentImageIndex) {
            const newImage = galleryItems[newIndex].querySelector('img');
            if (newImage && newImage.src) {
                openGallery(newImage.src, newIndex);
            }
        }
    }

    // Add click event to each gallery item
    galleryItems.forEach((item, index) => {
        item.addEventListener('click', function () {
            const img = this.querySelector('img');
            if (img && img.src) {
                openGallery(img.src, index);
            }
        });
    });

    // Close gallery when clicking the close button
    if (closeButton) {
        closeButton.addEventListener('click', function (e) {
            e.stopPropagation();
            closeGallery();
        });
    }

    // Close gallery when clicking on the overlay (outside the image)
    if (galleryOverlay) {
        galleryOverlay.addEventListener('click', function (e) {
            // Only close if the click is on the overlay, not on the image or buttons
            if (e.target === galleryOverlay) {
                closeGallery();
            }
        });
    }

    // Handle navigation button clicks
    if (prevButton) {
        prevButton.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateGallery('prev');
        });
    }

    if (nextButton) {
        nextButton.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateGallery('next');
        });
    }

    // Handle keyboard navigation
    document.addEventListener('keydown', function (e) {
        if (!galleryOverlay.classList.contains('active')) return;

        if (e.key === 'Escape') {
            closeGallery();
        }
    });

    // Lightbox functionality for illustrations
    const illustrations = document.querySelectorAll('.illustration');
    const lightbox = document.getElementById('lightbox');
    const lightboxImage = document.getElementById('lightbox-image');

    function openLightbox(imageSrc, darkSrc) {
        if (lightbox && lightboxImage) {
            // Set the appropriate image based on current theme
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            lightboxImage.src = isDark && darkSrc ? darkSrc : imageSrc;
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeLightbox() {
        if (lightbox) {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // Add click event to each illustration
    illustrations.forEach(illustration => {
        illustration.addEventListener('click', function () {
            const lightSrc = this.getAttribute('data-light-src') || this.src;
            const darkSrc = this.getAttribute('data-dark-src');
            openLightbox(lightSrc, darkSrc);
        });
    });

    // Close lightbox when clicking anywhere
    if (lightbox) {
        lightbox.addEventListener('click', function (e) {
            // If user clicks on the image, don't close
            if (e.target === lightboxImage) {
                e.stopPropagation();
                return;
            }
            closeLightbox();
        });

        // Close button handler
        const lightboxCloseBtn = document.querySelector('.lightbox-close-btn');
        if (lightboxCloseBtn) {
            lightboxCloseBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                closeLightbox();
            });
        }
    }

    // Update lightbox image when theme changes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme' && lightbox.classList.contains('active')) {
                const currentImg = document.querySelector('.illustration[src="' + lightboxImage.src + '"]');
                if (currentImg) {
                    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                    const darkSrc = currentImg.getAttribute('data-dark-src');
                    const lightSrc = currentImg.getAttribute('data-light-src') || currentImg.src;
                    lightboxImage.src = isDark && darkSrc ? darkSrc : lightSrc;
                }
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });

    // Handle keyboard events for lightbox
    document.addEventListener('keydown', function (e) {
        if (lightbox.classList.contains('active') && e.key === 'Escape') {
            closeLightbox();
        }
    });

    // Apply Safari fix on load
    applySafariContentFix();

    // Also apply Safari fix on window resize
    window.addEventListener('resize', () => {
        console.log('[Safari Fix] Window resized, rechecking measurements');
        applySafariContentFix();
    });

    // Optional: Handle dynamically added content
    const contentObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    processContentForInternalReferences(node);
                }
            });
        });
    });

    if (elements.mainContent) {
        contentObserver.observe(elements.mainContent, {
            childList: true,
            subtree: true
        });
    }

    // Handle document clicks for internal reference links - this updates the keyboard navigation
    document.addEventListener('click', (e) => {
        // Check if we clicked on an internal reference link
        const internalLink = e.target.closest('a.internal-ref-link');
        if (internalLink && internalLink.getAttribute('href')) {
            const href = internalLink.getAttribute('href');
            // Extract the hash from the href
            const hashMatch = href.match(/#([^&?]+)/);
            if (hashMatch && hashMatch[1]) {
                // Set this as the current active heading ID for keyboard navigation
                setTimeout(() => {
                    currentActiveHeadingId = hashMatch[1];
                }, 100); // Small delay to ensure the navigation completes
            }
        }
    });
});

// Theme handling
const themeToggle = document.getElementById('theme-toggle');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

// Load saved theme preference or use system preference
const savedTheme = localStorage.getItem('theme');
const systemTheme = prefersDark.matches ? 'dark' : 'light';
const currentTheme = savedTheme || systemTheme;

function setTheme(theme) {
    // Set the theme
    document.documentElement.setAttribute('data-theme', theme);

    // Update illustration images based on theme
    document.querySelectorAll('.illustration').forEach(img => {
        const lightSrc = img.getAttribute('data-light-src');
        const darkSrc = img.getAttribute('data-dark-src');
        if (lightSrc && darkSrc) {
            img.src = theme === 'dark' ? darkSrc : lightSrc;
        }
    });

    // Store the theme preference
    localStorage.setItem('theme', theme);

    // Announce to screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('class', 'sr-only');
    announcement.textContent = `Theme changed to ${theme} mode`;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
}

// Initialize theme and images
setTheme(currentTheme);

// Also update images on initial load
document.addEventListener('DOMContentLoaded', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('.illustration').forEach(img => {
        const lightSrc = img.getAttribute('data-light-src');
        const darkSrc = img.getAttribute('data-dark-src');
        if (lightSrc && darkSrc) {
            img.src = isDark ? darkSrc : lightSrc;
        }
    });
});

// Handle theme toggle
themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
});

// Handle system theme changes when no saved preference
prefersDark.addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
    }
});

// Glossary term marking
document.addEventListener('DOMContentLoaded', () => {
    // Helper function to escape special regex characters
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Helper function to create plural variations
    function getTermVariations(term) {
        const variations = [term];
        // Simple plural rules - can be expanded
        if (term.endsWith('y')) {
            variations.push(term.slice(0, -1) + 'ies');
        } else if (term.endsWith('s')) {
            variations.push(term + 'es');
        } else {
            variations.push(term + 's');
        }
        return variations;
    }

    // Build glossary index
    const glossaryTerms = new Map();
    let termCounter = 1;

    // Track which term numbers have been marked since the last headline
    const markedNumbersSinceHeadline = new Set();

    document.querySelectorAll('.glossary-list dt').forEach(term => {
        const termText = term.textContent.trim();
        // Get main term variations
        const variations = getTermVariations(termText);

        // Get additional terms from data attribute
        const altTermsStr = term.getAttribute('data-alt-terms');
        if (altTermsStr) {
            // Split by comma and trim each term
            const altTerms = altTermsStr.split(',').map(t => t.trim());
            // Get variations for each alternative term
            altTerms.forEach(altTerm => {
                variations.push(...getTermVariations(altTerm));
            });
        }

        // Add all variations to the map
        variations.forEach(variant => {
            glossaryTerms.set(variant.toLowerCase(), {
                number: termCounter,
                originalTerm: termText  // Always store the main term
            });
        });
        termCounter++;
    });

    // Function to mark terms in a text node
    function markTermsInNode(textNode) {
        if (!textNode.nodeValue.trim()) return;

        // Skip if we're in a headline or already processed node
        const parent = textNode.parentElement;
        if (parent.closest('.glossary-marked, .glossary')) {
            return;
        }

        // Reset marked terms when we encounter a headline
        if (parent.closest('h1, h2, h3, h4, h5, h6')) {
            markedNumbersSinceHeadline.clear();
            return;
        }

        // Skip if we're not in the systemic risk section
        const section = parent.closest('.content-section');
        if (!section || section.getAttribute('data-section') !== 'safety-security') {
            return;
        }

        // Normalize whitespace in the text, preserving single spaces for line breaks
        let text = textNode.nodeValue.replace(/\s+/g, ' ');
        let html = text;
        let hasChanges = false;

        // Sort terms by length (longest first) to handle overlapping terms
        const sortedTerms = Array.from(glossaryTerms.keys())
            .sort((a, b) => b.length - a.length);

        // Track which terms we've marked in this text node
        const markedTermsInNode = new Set();

        sortedTerms.forEach(term => {
            // Get the term info
            const info = glossaryTerms.get(term.toLowerCase());

            // Skip if already marked in this node or if the term number has been marked since the last headline
            if (markedTermsInNode.has(term) || markedNumbersSinceHeadline.has(info.number)) return;

            // Skip 'including' term in explanatory and FAQ boxes
            if (term.toLowerCase() === 'including' && parent.closest('.explanatory-box, .faq-box')) {
                return;
            }

            // Split the term into words and escape each word
            const escapedWords = term.split(/\s+/).map(word => escapeRegExp(word));
            // Join words with flexible whitespace matching
            const escapedPattern = escapedWords.join('\\s+');
            // Create the full regex pattern with word boundary checks
            const regex = new RegExp(`(?<=^|[^a-zA-Z0-9-])${escapedPattern}(?=$|[^a-zA-Z0-9-])`, 'gi');

            // Only replace first occurrence
            html = html.replace(regex, (match) => {
                if (markedTermsInNode.has(term)) return match;

                markedTermsInNode.add(term);
                markedNumbersSinceHeadline.add(info.number);
                hasChanges = true;

                return `<span class="glossary-marked" data-glossary-number="${info.number}">${match}</span>`;
            });
        });

        if (hasChanges) {
            const fragment = document.createRange().createContextualFragment(html);
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    }

    // Process all text nodes in the systemic risk section
    function processContent(root) {
        // If root is not the systemic risk section or within it, find it
        let systemicRiskSection = root;
        if (!root.matches('[data-section="safety-security"]')) {
            systemicRiskSection = root.querySelector('[data-section="safety-security"]');
            if (!systemicRiskSection) return; // Exit if not found
        }

        const walker = document.createTreeWalker(
            systemicRiskSection,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Skip if parent is already processed or in excluded elements
                    if (node.parentElement.closest('.glossary-marked, script, style, .glossary')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(markTermsInNode);
    }

    // Initial processing
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        processContent(mainContent);
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'glossary-popup';
    popup.innerHTML = `
        <div class="glossary-popup-header">
            <span class="glossary-popup-term"></span>
        </div>
        <div class="glossary-popup-definition"></div>
    `;
    document.body.appendChild(popup);

    // Track current popup state
    let currentTerm = null;
    let isHovering = false;
    let isClickShown = false;

    // Helper to get term definition
    function getTermDefinition(number) {
        const dt = document.querySelector(`.glossary-list dt:nth-child(${2 * number - 1})`);
        const dd = document.querySelector(`.glossary-list dt:nth-child(${2 * number - 1}) + dd`);
        return {
            term: dt?.textContent.trim(),
            definition: dd?.textContent.trim()
        };
    }

    // Helper to position popup
    function positionPopup(target) {
        const rect = target.getBoundingClientRect();
        const isMobile = window.matchMedia('(max-width: 768px)').matches;

        if (isMobile) {
            // Mobile positioning is handled by CSS
            return;
        }

        // Calculate available space
        const spaceRight = window.innerWidth - rect.right - 16; // 16px buffer
        const spaceLeft = rect.left - 16;

        // Default to right positioning
        let left = rect.right + 8;

        // If not enough space on right, try left
        if (spaceRight < 300 && spaceLeft > 300) {
            left = rect.left - 308; // 300px + 8px gap
        }
        // If neither side has space, center above/below
        else if (spaceRight < 300 && spaceLeft < 300) {
            left = Math.max(16, Math.min(
                window.innerWidth - 316,
                rect.left + (rect.width - 300) / 2
            ));
        }

        // Position relative to viewport and adjust for scroll
        popup.style.position = 'absolute';
        popup.style.left = `${left}px`;
        popup.style.top = `${rect.top + window.scrollY}px`; // Add scrollY since we're using absolute positioning
    }

    // Helper to hide popup
    function hidePopup(force = false) {
        if (force || (!isHovering && !isClickShown)) {
            popup.classList.remove('show');
            currentTerm = null;
            isClickShown = false;
        }
    }

    // Helper to show popup
    function showPopup(target, fromClick = false) {
        const number = parseInt(target.dataset.glossaryNumber);
        if (!number) return;

        const { term, definition } = getTermDefinition(number);
        if (!term || !definition) return;

        popup.querySelector('.glossary-popup-term').textContent = term;
        popup.querySelector('.glossary-popup-definition').textContent = definition;

        positionPopup(target);
        popup.classList.add('show');
        currentTerm = target;
        if (fromClick) {
            isClickShown = true;
        }
    }

    // Check if device has hover capability
    const hasHover = window.matchMedia('(hover: hover)').matches;

    // Click handlers for all devices
    document.addEventListener('click', (e) => {
        const term = e.target.closest('.glossary-marked');

        if (term) {
            if (currentTerm === term) {
                isHovering = false; // Reset hover state on click
                hidePopup(true); // Force hide on direct term click
            } else {
                isHovering = false; // Reset hover state on click
                isClickShown = true; // Set click state before showing
                showPopup(term, true);
            }
            e.stopPropagation();
        } else {
            isHovering = false; // Reset hover state on outside click
            hidePopup(true); // Force hide on outside click
        }
    });

    // Event handlers for hover
    if (hasHover) {
        document.addEventListener('mouseover', (e) => {
            const term = e.target.closest('.glossary-marked');
            if (term && !isClickShown) { // Don't show on hover if shown by click
                isHovering = true;
                showPopup(term, false);
            }
        });

        document.addEventListener('mouseout', (e) => {
            const term = e.target.closest('.glossary-marked');
            if (term) {
                isHovering = false;
                if (!isClickShown) { // Only hide if not shown by click
                    setTimeout(hidePopup, 100);
                }
            }
        });
    }

    // Handle scroll and resize
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        if (currentTerm) {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                if (currentTerm) {
                    positionPopup(currentTerm);
                }
            }, 100);
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (currentTerm) {
            positionPopup(currentTerm);
        }
    });

    // Optional: Handle dynamically added content
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    processContent(node);
                }
            });
        });
    });

    if (mainContent) {
        observer.observe(mainContent, {
            childList: true,
            subtree: true
        });
    }
});

// Article linking functionality
document.addEventListener('DOMContentLoaded', () => {
    // Initialize subheader decorative letters
    document.querySelectorAll('.subheader').forEach(subheader => {
        const paragraph = subheader.querySelector('p');
        if (paragraph && paragraph.textContent.trim().length > 0) {
            // Get the first letter
            const firstLetter = paragraph.textContent.trim().charAt(0).toUpperCase();

            // Create the decorative letter element
            const decorativeLetter = document.createElement('span');
            decorativeLetter.className = 'subheader-decorative-letter';
            decorativeLetter.textContent = firstLetter;
            decorativeLetter.setAttribute('aria-hidden', 'true');

            // Insert it at the beginning of the subheader
            subheader.insertBefore(decorativeLetter, subheader.firstChild);
        }
    });

    // Helper function to escape special regex characters
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Function to mark articles in a text node
    function markArticlesInNode(textNode) {
        if (!textNode.nodeValue.trim()) return;

        // Skip if we're in a headline or already processed node
        const parent = textNode.parentElement;
        // Allow <dd> elements in glossary to have AI Act links
        if (parent.closest('h1, h2, h3, h4, h5, h6, .ai-act-link') ||
            (parent.closest('.glossary') && !parent.closest('dd'))) {
            return;
        }

        let text = textNode.nodeValue;
        // Matches article references from the AI Act, handling:
        // ✓ Single articles: "Article 78 AI Act"
        // ✓ Multiple articles: "Articles 53 and 55 AI Act"
        // ✓ Articles with paragraphs: "Article 51(1) AI Act"
        // ✓ Articles with multiple levels: "Article 56(1)(3) AI Act"
        // ✓ Articles with points: "Article 53(1), point (a) AI Act"
        // ✓ Complex combinations: "Articles 51(1), 52 and 53(4) AI Act"
        // ✓ Line breaks: "Articles 53 and 55 AI\n    Act"
        // ✓ Recitals: "Recital 116 AI Act"
        // ✓ Mixed references: "Article 56(1)(3), Recital 1, and Recital 116 AI Act"
        // ✓ Annexes: "Annex XI AI Act" or "Annexes XI and XII AI Act"
        // ✓ Annex sections: "Annex XI, Section 2 AI Act"
        // ✓ Annex points: "Annex XI, Section 2, point 1 AI Act"
        // ✓ Mixed references with Annexes: "Article 56(1)(3), Recital 1, and Annex XI AI Act"
        // ✓ Handles any whitespace: Line feeds, tabs, multiple spaces anywhere
        // Does NOT match:
        // ✗ Other directives: "Article 4(3) of Directive (EU) 2019/790"
        // ✗ Standalone references: "Article 78" (without "AI Act")

        // Split the regex into parts for better readability and maintenance
        const articlePattern = /Articles?\s+(?:\d+(?:\([^)]*\))*(?:\s*,\s*|\s+and\s+|,\s+and\s+))*\d+(?:\([^)]*\))*/gi;
        const recitalPattern = /Recitals?\s+(?:\d+(?:\s*,\s*|\s+and\s+|,\s+and\s+))*\d+/gi;
        // Improved annex pattern to better handle "Annex XI, Section 2" format
        const annexPattern = /Annexes?\s+(?:[IVX]+(?:\s*,\s*|\s+and\s+|,\s+and\s+))*[IVX]+(?:(?:\s*,\s*|\s+)Section\s+\d+(?:(?:\s*,\s*|\s+)point\s+\d+\.?)?)?/gi;

        // Improved suffix pattern to be more flexible with what appears between the reference and "AI Act"
        const aiActSuffix = /[\s,]*(?:(?!\bDirective\s*\(EU\)).)*?\bAI[\s\n\r]+Act\b/i;

        // Process each type of reference
        const patterns = [
            { pattern: articlePattern, type: 'article' },
            { pattern: recitalPattern, type: 'recital' },
            { pattern: annexPattern, type: 'annex' }
        ];

        // Find all potential matches in the text
        let matches = [];

        patterns.forEach(({ pattern, type }) => {
            let patternMatch;
            while ((patternMatch = pattern.exec(text)) !== null) {
                // Check if this match is followed by "AI Act"
                const remainingText = text.substring(patternMatch.index + patternMatch[0].length);
                if (aiActSuffix.test(remainingText)) {
                    matches.push({
                        index: patternMatch.index,
                        length: patternMatch[0].length,
                        text: patternMatch[0],
                        type: type
                    });
                }
            }
        });

        // Special case for annexes with prefixes like "specifically"
        const prefixedAnnexPattern = /specifically\s+Annex\s+([IVX]+)(?:(?:\s*,\s*|\s+)Section\s+\d+(?:(?:\s*,\s*|\s+)point\s+\d+\.?)?)?/gi;
        let prefixMatch;
        while ((prefixMatch = prefixedAnnexPattern.exec(text)) !== null) {
            // Check if this match is followed by "AI Act"
            const remainingText = text.substring(prefixMatch.index + prefixMatch[0].length);
            if (aiActSuffix.test(remainingText)) {
                matches.push({
                    index: prefixMatch.index + prefixMatch[0].indexOf('Annex'),
                    length: prefixMatch[0].length - prefixMatch[0].indexOf('Annex'),
                    text: prefixMatch[0].substring(prefixMatch[0].indexOf('Annex')),
                    type: 'annex'
                });
            }
        }

        // Special case for mixed references with commas (Article followed by Annex)
        const mixedRefPattern = /Article\s+\d+(?:\([^)]*\))*\s*,\s*Annex\s+([IVX]+)(?:(?:\s*,\s*|\s+)Section\s+\d+(?:(?:\s*,\s*|\s+)point\s+\d+\.?)?)?/gi;
        let mixedMatch;
        while ((mixedMatch = mixedRefPattern.exec(text)) !== null) {
            // Check if this match is followed by "AI Act"
            const remainingText = text.substring(mixedMatch.index + mixedMatch[0].length);
            if (aiActSuffix.test(remainingText)) {
                // Add the article part
                const articleEndPos = mixedMatch[0].indexOf(',');
                matches.push({
                    index: mixedMatch.index,
                    length: articleEndPos,
                    text: mixedMatch[0].substring(0, articleEndPos),
                    type: 'article'
                });

                // Add the annex part
                const annexStartPos = mixedMatch[0].indexOf('Annex');
                matches.push({
                    index: mixedMatch.index + annexStartPos,
                    length: mixedMatch[0].length - annexStartPos,
                    text: mixedMatch[0].substring(annexStartPos),
                    type: 'annex'
                });
            }
        }

        // Special case for mixed references with commas (Recital followed by Annex)
        const recitalAnnexPattern = /Recital\s+\d+\s*,\s*Annex\s+([IVX]+)(?:(?:\s*,\s*|\s+)Section\s+\d+(?:(?:\s*,\s*|\s+)point\s+\d+\.?)?)?/gi;
        let recitalAnnexMatch;
        while ((recitalAnnexMatch = recitalAnnexPattern.exec(text)) !== null) {
            // Check if this match is followed by "AI Act"
            const remainingText = text.substring(recitalAnnexMatch.index + recitalAnnexMatch[0].length);
            if (aiActSuffix.test(remainingText)) {
                // Add the recital part
                const recitalEndPos = recitalAnnexMatch[0].indexOf(',');
                matches.push({
                    index: recitalAnnexMatch.index,
                    length: recitalEndPos,
                    text: recitalAnnexMatch[0].substring(0, recitalEndPos),
                    type: 'recital'
                });

                // Add the annex part
                const annexStartPos = recitalAnnexMatch[0].indexOf('Annex');
                matches.push({
                    index: recitalAnnexMatch.index + annexStartPos,
                    length: recitalAnnexMatch[0].length - annexStartPos,
                    text: recitalAnnexMatch[0].substring(annexStartPos),
                    type: 'annex'
                });
            }
        }

        // Special case for mixed references with commas (Article followed by Recital)
        const articleRecitalPattern = /Article\s+\d+(?:\([^)]*\))*\s*,\s*Recital\s+\d+/gi;
        let articleRecitalMatch;
        while ((articleRecitalMatch = articleRecitalPattern.exec(text)) !== null) {
            // Check if this match is followed by "AI Act"
            const remainingText = text.substring(articleRecitalMatch.index + articleRecitalMatch[0].length);
            if (aiActSuffix.test(remainingText)) {
                // Add the article part
                const articleEndPos = articleRecitalMatch[0].indexOf(',');
                matches.push({
                    index: articleRecitalMatch.index,
                    length: articleEndPos,
                    text: articleRecitalMatch[0].substring(0, articleEndPos),
                    type: 'article'
                });

                // Add the recital part
                const recitalStartPos = articleRecitalMatch[0].indexOf('Recital');
                matches.push({
                    index: articleRecitalMatch.index + recitalStartPos,
                    length: articleRecitalMatch[0].length - recitalStartPos,
                    text: articleRecitalMatch[0].substring(recitalStartPos),
                    type: 'recital'
                });
            }
        }

        // Sort matches by their starting position
        matches.sort((a, b) => a.index - b.index);

        // Apply matches without overlapping
        let lastIndex = 0;
        let fragments = [];

        for (const match of matches) {
            // Skip if this match overlaps with a previous match
            if (match.index < lastIndex) continue;

            // Add text before the match
            if (match.index > lastIndex) {
                fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            // Create individual links for each reference within the match
            const matchText = match.text;

            // Create regex pattern based on the match type
            let refPattern;
            if (match.type === 'article') {
                // Pattern for individual article references: digits followed by optional parentheses content
                refPattern = /\d+(?:\([^)]*\))*/g;
            } else if (match.type === 'recital') {
                // Pattern for individual recital references: just digits
                refPattern = /\d+/g;
            } else { // annex
                // Pattern for individual annex references: Roman numerals with optional Section/point
                refPattern = /[IVX]+(?:(?:\s*,\s*|\s+)Section\s+\d+(?:(?:\s*,\s*|\s+)point\s+\d+\.?)?)?/g;
            }

            // Find all individual references in the match text
            let lastRefEnd = 0;
            let refMatch;
            const matchFragment = document.createDocumentFragment();

            while ((refMatch = refPattern.exec(matchText)) !== null) {
                // Add text before this reference
                if (refMatch.index > lastRefEnd) {
                    matchFragment.appendChild(
                        document.createTextNode(matchText.slice(lastRefEnd, refMatch.index))
                    );
                }

                // Create a link for this specific reference
                const link = document.createElement('a');
                link.className = 'ai-act-link';

                // Set appropriate target URL based on reference type
                if (match.type === 'recital') {
                    const recitalNumber = refMatch[0].match(/\d+/)[0];
                    link.href = `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689#rct_${recitalNumber}`;
                } else if (match.type === 'annex') {
                    // Improved to consistently extract annex number even with section/point info
                    const annexNumber = refMatch[0].match(/^[IVX]+/)[0];
                    link.href = `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689#anx_${annexNumber}`;
                } else { // article
                    const articleNumber = refMatch[0].match(/\d+/)[0];
                    link.href = `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689#art_${articleNumber}`;
                }

                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = refMatch[0];
                matchFragment.appendChild(link);

                lastRefEnd = refMatch.index + refMatch[0].length;
            }

            // Add any remaining text from the match
            if (lastRefEnd < matchText.length) {
                matchFragment.appendChild(
                    document.createTextNode(matchText.slice(lastRefEnd))
                );
            }

            fragments.push(matchFragment);
            lastIndex = match.index + match.length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            fragments.push(document.createTextNode(text.slice(lastIndex)));
        }

        // Only replace if we found matches
        if (fragments.length > 1) { // More than just the original text
            const container = document.createDocumentFragment();
            fragments.forEach(fragment => container.appendChild(fragment));
            textNode.parentNode.replaceChild(container, textNode);
        }
    }

    // Process all text nodes in the main content
    function processContent(root) {
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Skip if parent is already processed or in excluded elements
                    if (node.parentElement.closest('.ai-act-link, script, style') ||
                        (node.parentElement.closest('.glossary') && !node.parentElement.closest('dd'))) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(markArticlesInNode);
    }

    // Initial processing
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        processContent(mainContent);
    }

    // Optional: Handle dynamically added content
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    processContent(node);
                }
            });
        });
    });

    if (mainContent) {
        observer.observe(mainContent, {
            childList: true,
            subtree: true
        });
    }
});

// Function to build internal reference maps from headline anchors
function buildInternalReferenceMaps() {
    // Reset maps
    internalReferenceMap.commitments.clear();
    internalReferenceMap.measures.clear();
    internalReferenceMap.appendices.clear();

    // Process each section's anchors
    for (const [section, anchors] of Object.entries(headlineAnchors)) {
        anchors.forEach(anchor => {
            // Extract reference numbers from IDs
            // Examples: commitment-i-1-documentation-2, commitment-ii-5-systemic-risk-acceptance-determination-2
            const commitmentMatch = anchor.id.match(/commitment-([iv]+)-(\d+(?:-\d+)*)/i);
            // Examples: measure-i-1-1-drawing-up-and-keeping-up-to-date-model-documentation
            const measureMatch = anchor.id.match(/measure-([iv]+)-(\d+(?:-\d+)*)/i);
            // Examples: appendix-1-1-selected-types-of-systemic-risk
            const appendixMatch = anchor.id.match(/appendix-(\d+(?:-\d+)*)/i);

            if (commitmentMatch) {
                const [_, roman, dashNumbers] = commitmentMatch;
                // Convert dash-separated numbers to dot-separated
                const number = dashNumbers.replace(/-/g, '.');
                const ref = `${roman.toUpperCase()}.${number}`;
                internalReferenceMap.commitments.set(ref, { section, id: anchor.id });
            } else if (measureMatch) {
                const [_, roman, dashNumbers] = measureMatch;
                // Convert dash-separated numbers to dot-separated
                const number = dashNumbers.replace(/-/g, '.');
                const ref = `${roman.toUpperCase()}.${number}`;
                internalReferenceMap.measures.set(ref, { section, id: anchor.id });
            } else if (appendixMatch) {
                const [_, dashNumbers] = appendixMatch;
                // Convert dash-separated numbers to dot-separated
                const number = dashNumbers.replace(/-/g, '.');
                internalReferenceMap.appendices.set(number, { section, id: anchor.id });
            }
        });
    }
}

// Function to process text nodes and add internal reference links
function processInternalReferences(textNode) {
    if (!textNode.nodeValue.trim()) return;

    // Skip if we're in a headline or already processed node
    const parent = textNode.parentElement;
    if (parent.closest('h1, h2, h3, h4, h5, h6, .internal-ref-link')) {
        return;
    }

    let text = textNode.nodeValue;
    let matches = [];

    // First, handle ranges with dashes (like I.2.2—I.2.6)
    handleReferenceRanges(text, matches);

    // Match patterns for references
    const patterns = [
        {
            // Matches "Commitment I.1" or "Commitment II.4" (singular form)
            pattern: /\b(?:commitment)\s+([IV]+\.\d+(?:\.\d+)*)/gi,
            type: 'commitment',
            mode: 'single'
        },
        {
            // Special pattern for "Commitments X and Y"
            pattern: /\b(?:commitments)\s+([IV]+\.\d+(?:\.\d+)*)\s+and\s+([IV]+\.\d+(?:\.\d+)*)/gi,
            type: 'commitment',
            mode: 'pair'
        },
        {
            // Matches "Commitments I.1, I.2 and I.3" (plural form with multiple references)
            pattern: /\b(?:commitments)\s+(?:([IV]+\.(?:\d+(?:\.\d+)*))(?:\s*,\s*|\s+and\s+|$))+/gi,
            type: 'commitment',
            mode: 'list'
        },
        {
            // Matches "Measure I.1.1" or "Measure II.4.1" (singular form)
            pattern: /\b(?:measure)\s+([IV]+\.(?:\d+(?:\.\d+)*))/gi,
            type: 'measure',
            mode: 'single'
        },
        {
            // Special pattern for "Measures X and Y"
            pattern: /\b(?:measures)\s+([IV]+\.\d+(?:\.\d+)*)\s+and\s+([IV]+\.\d+(?:\.\d+)*)/gi,
            type: 'measure',
            mode: 'pair'
        },
        {
            // Matches "Measures I.1.1, I.1.2, etc." (plural form with multiple references)
            pattern: /\b(?:measures)\s+(?:([IV]+\.(?:\d+(?:\.\d+)*))(?:\s*,\s*|\s+and\s+|$))+/gi,
            type: 'measure',
            mode: 'list'
        },
        {
            // Matches "Appendix 1" or "Appendix 1.1" (singular form)
            pattern: /\b(?:appendix)\s+(\d+(?:\.\d+)*)/gi,
            type: 'appendix',
            mode: 'single'
        },
        {
            // Special pattern for lone appendix numbers (fallback for detection)
            pattern: /\b(?:appendix)\s+(\d+(?:\.\d+)*)\b/gi,
            type: 'appendix',
            mode: 'single'
        },
        {
            // Special pattern for "Appendices X and Y"
            pattern: /\b(?:appendices)\s+(\d+(?:\.\d+)*)\s+and\s+(\d+(?:\.\d+)*)/gi,
            type: 'appendix',
            mode: 'pair'
        },
        {
            // Matches "Appendices 1.1, 1.2, etc." (plural form with multiple references)
            pattern: /\b(?:appendices)\s+(?:(\d+(?:\.\d+)*)(?:\s*,\s*|\s+and\s+|$))+/gi,
            type: 'appendix',
            mode: 'list'
        }
    ];

    // Find all matches in the text
    patterns.forEach(({ pattern, type, mode }) => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            // Different extraction based on pattern mode
            if (mode === 'single') {
                // For singular patterns, the reference is in capture group 1
                if (match[1]) {
                    // Skip if this reference is part of a range we've already processed
                    if (!isPartOfExistingMatch(matches, match.index + match[0].indexOf(match[1]), match[1].length)) {
                        matches.push({
                            index: match.index + match[0].indexOf(match[1]),
                            length: match[1].length,
                            text: match[1],
                            type: type
                        });
                    }
                }
            } else if (mode === 'pair') {
                // For pair patterns like "Measures I.2.2 and I.2.3", extract both references directly
                if (match[1] && match[2]) {
                    const firstRef = match[1];
                    const secondRef = match[2];

                    // Add first reference
                    if (!isPartOfExistingMatch(matches, match.index + match[0].indexOf(firstRef), firstRef.length)) {
                        matches.push({
                            index: match.index + match[0].indexOf(firstRef),
                            length: firstRef.length,
                            text: firstRef,
                            type: type
                        });
                    }

                    // Add second reference
                    if (!isPartOfExistingMatch(matches, match.index + match[0].lastIndexOf(secondRef), secondRef.length)) {
                        matches.push({
                            index: match.index + match[0].lastIndexOf(secondRef),
                            length: secondRef.length,
                            text: secondRef,
                            type: type
                        });
                    }
                }
            } else if (mode === 'list') {
                // For list patterns, extract all reference numbers
                const refNumbers = match[0].match(/[IV]+\.\d+(?:\.\d+)*|\d+(?:\.\d+)*/gi);
                if (refNumbers) {
                    refNumbers.forEach(refNumber => {
                        // Skip if this reference is part of a range we've already processed
                        if (!isPartOfExistingMatch(matches, match.index + match[0].indexOf(refNumber), refNumber.length)) {
                            matches.push({
                                index: match.index + match[0].indexOf(refNumber),
                                length: refNumber.length,
                                text: refNumber,
                                type: type
                            });
                        }
                    });
                }
            }
        }
    });

    // Special handling for appendix references that might appear in running text
    if (text.includes("appendix") || text.includes("Appendix")) {
        // Look for appendix-like patterns (e.g., "1.4" after "Appendix")
        const appendixPattern = /\b(\d+(?:\.\d+)*)\b/g;
        let appendixMatch;

        while ((appendixMatch = appendixPattern.exec(text)) !== null) {
            const refNumber = appendixMatch[1];
            // Verify this is likely an appendix reference (e.g., "1.4") by checking nearby text
            const contextStart = Math.max(0, appendixMatch.index - 20);
            const contextEnd = Math.min(text.length, appendixMatch.index + 20);
            const context = text.substring(contextStart, contextEnd).toLowerCase();

            if (context.includes("appendix") || context.includes("appendices")) {
                // Skip if this reference is part of a range we've already processed
                if (!isPartOfExistingMatch(matches, appendixMatch.index, refNumber.length)) {
                    matches.push({
                        index: appendixMatch.index,
                        length: refNumber.length,
                        text: refNumber,
                        type: 'appendix'
                    });
                }
            }
        }
    }

    // Sort matches by their starting position
    matches.sort((a, b) => a.index - b.index);

    // Apply matches without overlapping
    let lastIndex = 0;
    let fragments = [];

    for (const match of matches) {
        // Skip if this match overlaps with a previous match or is virtual
        if (match.index < lastIndex || match.virtual) continue;

        // Add text before the match
        if (match.index > lastIndex) {
            fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        // Create link for the reference
        const link = document.createElement('a');
        link.className = 'internal-ref-link';
        link.textContent = match.text;

        // Get the appropriate mapping based on the type
        let mapKey;
        if (match.type === 'commitment') {
            mapKey = 'commitments';
        } else if (match.type === 'measure') {
            mapKey = 'measures';
        } else if (match.type === 'appendix') {
            mapKey = 'appendices';
        }

        const map = internalReferenceMap[mapKey];
        if (map) {
            const mapping = map.get(match.text.toUpperCase());
            if (mapping) {
                link.href = `?section=${mapping.section}#${mapping.id}`;
            }
        }

        fragments.push(link);
        lastIndex = match.index + match.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        fragments.push(document.createTextNode(text.slice(lastIndex)));
    }

    // Only replace if we found matches
    if (fragments.length > 1) {
        const container = document.createDocumentFragment();
        fragments.forEach(fragment => container.appendChild(fragment));
        textNode.parentNode.replaceChild(container, textNode);
    }
}

// Helper function to check if a position is already part of an existing match
function isPartOfExistingMatch(matches, index, length) {
    for (const match of matches) {
        if (index >= match.index && index + length <= match.index + match.length) {
            return true;
        }
    }
    return false;
}

// Helper function to handle reference ranges like "I.2.2—I.2.6"
function handleReferenceRanges(text, matches) {
    // Match patterns for reference ranges - include various dash characters
    const rangePattern = /([IV]+\.\d+(?:\.\d+)*)[–—-]([IV]+\.\d+(?:\.\d+)*)/g;

    let rangeMatch;
    while ((rangeMatch = rangePattern.exec(text)) !== null) {
        const [fullMatch, start, end] = rangeMatch;

        // Determine type based on format (simple heuristic)
        let type;
        if (start.match(/^[IV]+\.\d+$/)) {
            // Format like "II.1" - this is a commitment
            type = 'commitment';
        } else if (start.match(/^[IV]+\.\d+\.\d+$/)) {
            // Format like "II.1.1" - this is a measure
            type = 'measure';
        } else {
            // Default to appendix
            type = 'appendix';
        }

        // Extract the prefix (roman numeral) and suffixes (numbers)
        const startParts = start.match(/^([IV]+)\.(.+)$/);
        const endParts = end.match(/^([IV]+)\.(.+)$/);

        if (startParts && endParts && startParts[1] === endParts[1]) {
            // Only handle case where prefixes (roman numerals) are the same
            const prefix = startParts[1];
            const startNum = startParts[2].split('.').map(Number);
            const endNum = endParts[2].split('.').map(Number);

            // For simple cases where only last number changes
            if (startNum.length === endNum.length &&
                (startNum.length === 1 || startNum.slice(0, -1).every((n, i) => n === endNum[i]))) {

                for (let i = startNum[startNum.length - 1]; i <= endNum[endNum.length - 1]; i++) {
                    const newNum = [...startNum.slice(0, -1), i].join('.');
                    const ref = `${prefix}.${newNum}`;

                    // Add this reference to our matches
                    if (i === startNum[startNum.length - 1]) {
                        // First item in range - use original position
                        matches.push({
                            index: rangeMatch.index,
                            length: start.length,
                            text: start,
                            type: type
                        });
                    } else if (i === endNum[endNum.length - 1]) {
                        // Last item in range - use original position
                        matches.push({
                            index: rangeMatch.index + fullMatch.length - end.length,
                            length: end.length,
                            text: end,
                            type: type
                        });
                    } else {
                        // Items in between - they're virtual, so we'll just store
                        // them with the range start position for reference
                        matches.push({
                            index: rangeMatch.index,
                            length: 0, // virtual match
                            text: ref,
                            type: type,
                            virtual: true // Mark this as a virtual reference for later handling
                        });
                    }
                }
            }
        }
    }
}

// Function to process all content for internal references
function processContentForInternalReferences(root) {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                if (node.parentElement.closest('.internal-ref-link, script, style, h1, h2, h3, h4, h5, h6')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(processInternalReferences);
}
