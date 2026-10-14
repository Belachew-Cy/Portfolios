/* ============================================
   PORTFOLIO WEBSITE - MAIN JAVASCRIPT
   File: js/script.js
   ============================================ */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    
    /* ============================================
       SECTION 1: BROWSER & DEVICE DETECTION
       ============================================ */
    
    // Detect device type using matchMedia
    function detectDevice() {
        const isMobile = window.matchMedia('(max-width: 768px)').matches;
        const isTablet = window.matchMedia('(min-width: 769px) and (max-width: 1024px)').matches;
        const isDesktop = window.matchMedia('(min-width: 1025px)').matches;
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        return {
            isMobile,
            isTablet,
            isDesktop,
            isTouch,
            type: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'
        };
    }

    // Detect OS preferences (Dark mode, motion, contrast)
    function detectOSPreferences() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;

        return {
            prefersDark,
            prefersLight,
            prefersReducedMotion,
            prefersHighContrast,
            colorScheme: prefersDark ? 'dark' : prefersLight ? 'light' : 'unknown'
        };
    }

    // Detect screen properties (DPI, resolution)
    function detectScreenProperties() {
        const dpr = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isRetina = dpr > 1;

        return {
            dpr,
            width,
            height,
            isRetina,
            aspectRatio: width / height
        };
    }

    // Detect network conditions
    function detectNetwork() {
        if ('connection' in navigator) {
            const conn = navigator.connection;
            return {
                effectiveType: conn.effectiveType || 'unknown',
                downlink: conn.downlink || 0,
                rtt: conn.rtt || 0,
                saveData: conn.saveData || false,
                isSlow: ['slow-2g', '2g'].includes(conn.effectiveType)
            };
        }
        return {
            effectiveType: 'unknown',
            downlink: 0,
            rtt: 0,
            saveData: false,
            isSlow: false
        };
    }

    // Detect browser features support
    function detectFeatures() {
        return {
            grid: CSS.supports('display', 'grid'),
            flexbox: CSS.supports('display', 'flex'),
            sticky: CSS.supports('position', 'sticky'),
            customProperties: CSS.supports('--var', 'value'),
            intersectionObserver: 'IntersectionObserver' in window,
            fetch: 'fetch' in window,
            promises: 'Promise' in window,
            serviceWorker: 'serviceWorker' in navigator,
            webp: checkWebPSupport(),
            localStorage: 'localStorage' in window,
            sessionStorage: 'sessionStorage' in window,
            geolocation: 'geolocation' in navigator,
            notifications: 'Notification' in window
        };
    }

    // Helper: Check WebP support
    function checkWebPSupport() {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        return canvas.toDataURL('image/webp').indexOf('image/webp') === 5;
    }

    /* ============================================
       SECTION 2: DEVICE-SPECIFIC ACTIONS
       ============================================ */

    // Run code based on device type
    function deviceSpecificActions() {
        const device = detectDevice();
        const network = detectNetwork();
        const screen = detectScreenProperties();

        // Mobile: load lightweight features
        if (device.isMobile) {
            document.body.classList.add('is-mobile');
            // Disable heavy animations on mobile
            document.body.classList.add('reduce-motion');
            loadMobileFeatures();
        }

        // Tablet: load medium features
        if (device.isTablet) {
            document.body.classList.add('is-tablet');
            loadTabletFeatures();
        }

        // Desktop: load full features
        if (device.isDesktop) {
            document.body.classList.add('is-desktop');
            loadDesktopFeatures();
        }

        // Retina: load high-res images
        if (screen.isRetina) {
            loadHighResImages();
        }

        // Slow network: load low-res assets
        if (network.isSlow) {
            document.body.classList.add('slow-connection');
            loadLowResImages();
        }
    }

    // Load features based on device
    function loadMobileFeatures() {
        console.log('📱 Mobile mode activated');
        // Add mobile-specific event listeners
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
    }

    function loadTabletFeatures() {
        console.log('📟 Tablet mode activated');
    }

    function loadDesktopFeatures() {
        console.log('🖥️ Desktop mode activated');
        // Add desktop-specific features
        enableParallax();
        enableHoverEffects();
    }

    function loadHighResImages() {
        document.querySelectorAll('img[data-retina]').forEach(img => {
            img.src = img.dataset.retina;
        });
        console.log('🖼️ High-res images loaded');
    }

    function loadLowResImages() {
        document.querySelectorAll('img[data-lowres]').forEach(img => {
            img.src = img.dataset.lowres;
        });
        console.log('📉 Low-res images loaded (slow network)');
    }

    /* ============================================
       SECTION 3: LAZY LOADING
       ============================================ */

    // Lazy load images using Intersection Observer
    function lazyLoadImages() {
        if ('IntersectionObserver' in window) {
            const images = document.querySelectorAll('img[data-src]');
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        imageObserver.unobserve(img);
                    }
                });
            }, {
                rootMargin: '50px',
                threshold: 0.01
            });

            images.forEach(img => imageObserver.observe(img));
            console.log('👀 Lazy loading enabled for images');
        } else {
            // Fallback: load all images immediately
            document.querySelectorAll('img[data-src]').forEach(img => {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            });
            console.log('⚠️ IntersectionObserver not supported, loading all images');
        }
    }

    // Lazy load CSS
    function lazyLoadCSS(filename) {
        if (document.querySelector(`link[href="${filename}"]`)) return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = filename;
        link.media = 'print';
        link.onload = function() {
            this.media = 'all';
            console.log(`✅ CSS loaded: ${filename}`);
        };
        document.head.appendChild(link);
    }

    // Lazy load JavaScript
    function lazyLoadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
            console.log(`📦 Script loaded: ${src}`);
        });
    }

    /* ============================================
       SECTION 4: PERFORMANCE OPTIMIZATIONS
       ============================================ */

    // Debounce function for resize events
    function debounce(func, delay = 250) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // Throttle function for scroll events
    function throttle(func, limit = 100) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Handle resize events efficiently
    const handleResize = debounce(() => {
        console.log('📐 Window resized:', window.innerWidth);
        const device = detectDevice();
        document.body.className = device.type;
    }, 250);

    // Handle scroll events efficiently
    const handleScroll = throttle(() => {
        // Update scroll position indicators
        updateScrollIndicators();
    }, 100);

    /* ============================================
       SECTION 5: MOBILE NAVIGATION - HAMBURGER MENU
       ============================================ */

    function initMobileNav() {
        const navbar = document.querySelector('.navbar');
        const navLinks = document.querySelector('.nav-links');
        
        if (!navbar || !navLinks) return;

        // Only add hamburger if it doesn't exist and screen is mobile
        if (!document.querySelector('.hamburger-menu') && window.innerWidth <= 768) {
            // Create hamburger menu button
            const hamburger = document.createElement('button');
            hamburger.className = 'hamburger-menu';
            hamburger.setAttribute('aria-label', 'Toggle navigation menu');
            hamburger.innerHTML = '<i class="fas fa-bars"></i>';
            
            // Insert hamburger before nav-links
            navbar.insertBefore(hamburger, navLinks);
            
            // Toggle menu on hamburger click
            hamburger.addEventListener('click', function(e) {
                e.stopPropagation();
                navLinks.classList.toggle('active');
                const icon = this.querySelector('i');
                icon.classList.toggle('fa-bars');
                icon.classList.toggle('fa-times');
            });
            
            // Close menu when a link is clicked
            navLinks.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', function() {
                    navLinks.classList.remove('active');
                    const icon = hamburger.querySelector('i');
                    if (icon) {
                        icon.classList.remove('fa-times');
                        icon.classList.add('fa-bars');
                    }
                });
            });
        }
    }

    /* ============================================
       SECTION 6: ACTIVE NAVIGATION LINK
       ============================================ */

    function setActiveNavLink() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const currentHash = window.location.hash;
        const navLinks = document.querySelectorAll('.nav-links a');

        navLinks.forEach(link => {
            const linkHref = link.getAttribute('href');
            let isActive;
            if (linkHref.startsWith('#')) {
                // One-page section links: default to #home when no hash is set.
                isActive = linkHref === (currentHash || '#home');
            } else {
                isActive = linkHref === currentPage;
            }
            link.classList.toggle('active', isActive);
        });
    }

    /* ============================================
       SECTION 7: SMOOTH SCROLLING
       ============================================ */

    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const targetId = this.getAttribute('href');
                if (targetId !== '#') {
                    const targetElement = document.querySelector(targetId);
                    if (targetElement) {
                        e.preventDefault();
                        targetElement.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                }
            });
        });
    }

    /* ============================================
       SECTION 8: SCROLL ANIMATIONS
       ============================================ */

    function initScrollAnimations() {
        if ('IntersectionObserver' in window) {
            const animateElements = document.querySelectorAll(
                '.work-item, .skill-card, .stat-item, .info-card, .about-grid, .hero-content, .service-card'
            );
            
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('animate-fade-in');
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                        observer.unobserve(entry.target);
                    }
                });
            }, {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            });
            
            animateElements.forEach(element => {
                if (!element.classList.contains('animate-fade-in')) {
                    element.style.opacity = '0';
                    element.style.transform = 'translateY(30px)';
                    element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                    observer.observe(element);
                }
            });
        }
    }

    /* ============================================
       SECTION 8b: POST-LOGIN SCROLL TOUR
       After signing in the home page glides once
       through Home -> Work -> Contact.
       ============================================ */

    function initPostLoginTour() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('tour') !== '1') return;

        // Clean the flag so refreshing does not replay the tour.
        history.replaceState(null, '', window.location.pathname);

        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const stops = ['#home', '#work', '#contact']
            .map(selector => document.querySelector(selector))
            .filter(Boolean);
        if (prefersReduced || stops.length < 2) return;

        const STEP_MS = 1700;
        let index = 0;
        let cancelled = false;

        const go = () => {
            if (cancelled || index >= stops.length) return;
            stops[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
            index += 1;
            if (index < stops.length) {
                timer = setTimeout(go, STEP_MS);
            }
        };
        const cancel = () => {
            cancelled = true;
            clearTimeout(timer);
        };

        // Any user input hands control back immediately.
        ['wheel', 'touchstart', 'keydown'].forEach(eventName =>
            document.addEventListener(eventName, cancel, { once: true, passive: true })
        );

        let timer = setTimeout(go, 700);
    }

    /* ============================================
       SECTION 9: BACK TO TOP BUTTON
       ============================================ */

    function initBackToTop() {
        if (!document.querySelector('.back-to-top')) {
            const backToTop = document.createElement('button');
            backToTop.className = 'back-to-top';
            backToTop.setAttribute('aria-label', 'Back to top');
            backToTop.innerHTML = '<i class="fas fa-chevron-up"></i>';
            document.body.appendChild(backToTop);
            
            // Show/hide button based on scroll position
            window.addEventListener('scroll', function() {
                if (window.pageYOffset > 300) {
                    backToTop.classList.add('visible');
                } else {
                    backToTop.classList.remove('visible');
                }
            });
            
            // Scroll to top when clicked
            backToTop.addEventListener('click', function() {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            });
        }
    }

    /* ============================================
       SECTION 9b: FOOTER BACK-TO-TOP BUTTON
       ============================================ */

    function initFooterTop() {
        document.querySelectorAll('.footer-top').forEach(btn => {
            btn.addEventListener('click', function() {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    /* ============================================
       SECTION 10: SCROLL INDICATORS
       ============================================ */

    function updateScrollIndicators() {
        const scrollPosition = window.pageYOffset;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const scrollable = documentHeight - windowHeight;
        const scrollPercentage = scrollable > 0 ? (scrollPosition / scrollable) * 100 : 0;
        
        // Update scroll progress bar if exists
        const progressBar = document.querySelector('.scroll-progress');
        if (progressBar) {
            progressBar.style.width = scrollPercentage + '%';
        }
    }

    /* ============================================
       SECTION 10b: SCROLL PROGRESS BAR
       ============================================ */

    function initScrollProgress() {
        if (document.querySelector('.scroll-progress')) return;
        const bar = document.createElement('div');
        bar.className = 'scroll-progress';
        bar.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bar);
        updateScrollIndicators();
    }

    /* ============================================
       SECTION 10c: THEME TOGGLE (dark/light)
       ============================================ */

    function initThemeToggle() {
        const stored = safeGetItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = stored || (prefersDark ? 'dark' : 'light');
        applyTheme(theme);

        const navbar = document.querySelector('.navbar');
        if (!navbar || navbar.querySelector('.theme-toggle')) return;

        const btn = document.createElement('button');
        btn.className = 'theme-toggle';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Toggle dark mode');
        navbar.appendChild(btn);
        renderThemeIcon(btn, theme);

        btn.addEventListener('click', function() {
            const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            renderThemeIcon(btn, next);
            safeSetItem('theme', next);
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    function renderThemeIcon(btn, theme) {
        btn.innerHTML = theme === 'dark'
            ? '<i class="fas fa-sun"></i>'
            : '<i class="fas fa-moon"></i>';
    }

    // localStorage can throw in private mode / sandboxed frames
    function safeGetItem(key) {
        try { return window.localStorage.getItem(key); } catch (_) { return null; }
    }
    function safeSetItem(key, value) {
        try { window.localStorage.setItem(key, value); } catch (_) { /* ignore */ }
    }

    /* ============================================
       SECTION 11: WORK PAGE - FILTER FUNCTIONALITY
       ============================================ */

    function initWorkFilters() {
        const filterButtons = document.querySelectorAll('.filter-btn');
        const workItems = document.querySelectorAll('.work-item');
        
        if (filterButtons.length > 0 && workItems.length > 0) {
            filterButtons.forEach(button => {
                button.addEventListener('click', function() {
                    // Remove active class from all filter buttons
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    // Add active class to clicked button
                    this.classList.add('active');
                    
                    const filterValue = this.getAttribute('data-filter');
                    
                    // Filter work items with animation
                    workItems.forEach((item, index) => {
                        const category = item.getAttribute('data-category');
                        
                        if (filterValue === 'all' || filterValue === category) {
                            item.style.display = 'block';
                            setTimeout(() => {
                                item.style.opacity = '1';
                                item.style.transform = 'translateY(0)';
                            }, index * 100);
                        } else {
                            item.style.display = 'none';
                            item.style.opacity = '0';
                            item.style.transform = 'translateY(20px)';
                        }
                    });
                });
            });
        }
    }

    /* ============================================
       SECTION 12: WORK HOVER EFFECTS
       ============================================ */

    function initWorkHoverEffects() {
        const workItems = document.querySelectorAll('.work-item');
        workItems.forEach(item => {
            item.addEventListener('mouseenter', function() {
                const image = this.querySelector('.work-image i');
                if (image) {
                    image.style.transition = 'transform 0.3s ease';
                    image.style.transform = 'scale(1.1) rotate(3deg)';
                }
            });
            
            item.addEventListener('mouseleave', function() {
                const image = this.querySelector('.work-image i');
                if (image) {
                    image.style.transform = 'scale(1) rotate(0deg)';
                }
            });
        });
    }

    /* ============================================
       SECTION 13: SKILL TAGS INTERACTION
       ============================================ */

    function initSkillTags() {
        const skillTags = document.querySelectorAll('.tag');
        skillTags.forEach(tag => {
            tag.addEventListener('click', function() {
                this.classList.toggle('active');
                if (this.classList.contains('active')) {
                    this.style.transform = 'scale(1.05)';
                    this.style.boxShadow = '0 4px 12px rgba(74, 108, 247, 0.3)';
                } else {
                    this.style.transform = 'scale(1)';
                    this.style.boxShadow = 'none';
                }
                
                setTimeout(() => {
                    this.style.transform = 'scale(1)';
                }, 200);
            });
        });
    }

    /* ============================================
       SECTION 14: CONTACT FORM - VALIDATION & SUBMIT
       ============================================ */

    function initContactForm() {
        const contactForm = document.getElementById('contactForm');
        
        if (contactForm) {
            contactForm.addEventListener('submit', function(e) {
                e.preventDefault();
                
                // Get form elements
                const name = document.getElementById('name');
                const email = document.getElementById('email');
                const message = document.getElementById('message');
                
                // Reset previous error states
                document.querySelectorAll('.form-error').forEach(el => el.remove());
                [name, email, message].forEach(field => {
                    if (field) {
                        field.style.borderColor = '';
                        field.style.boxShadow = '';
                    }
                });
                
                // Validation flags
                let isValid = true;
                let errorMessages = [];
                
                // Validate Name
                if (!name || !name.value.trim() || name.value.trim().length < 2) {
                    isValid = false;
                    errorMessages.push('Please enter your full name (minimum 2 characters).');
                    if (name) {
                        name.style.borderColor = '#e2555c';
                        name.style.boxShadow = '0 0 0 4px rgba(226, 85, 92, 0.1)';
                        showFieldError(name, 'Name is required (min 2 characters)');
                    }
                }
                
                // Validate Email
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!email || !email.value.trim() || !emailPattern.test(email.value.trim())) {
                    isValid = false;
                    errorMessages.push('Please enter a valid email address.');
                    if (email) {
                        email.style.borderColor = '#e2555c';
                        email.style.boxShadow = '0 0 0 4px rgba(226, 85, 92, 0.1)';
                        showFieldError(email, 'Valid email is required');
                    }
                }
                
                // Validate Message
                if (!message || !message.value.trim() || message.value.trim().length < 10) {
                    isValid = false;
                    errorMessages.push('Please enter a message (minimum 10 characters).');
                    if (message) {
                        message.style.borderColor = '#e2555c';
                        message.style.boxShadow = '0 0 0 4px rgba(226, 85, 92, 0.1)';
                        showFieldError(message, 'Message is required (min 10 characters)');
                    }
                }
                
                // If valid, POST to Flask backend
                if (isValid) {
                    const submitButton = contactForm.querySelector('.btn-submit');
                    const originalText = submitButton.innerHTML;
                    
                    submitButton.disabled = true;
                    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
                    
                    fetch('/contact', {
                        method: 'POST',
                        body: new FormData(contactForm)
                    })
                    .then(response => {
                        if (!response.ok) throw new Error('Server error');
                        const formCard = document.querySelector('.form-card');
                        const safeName = escapeHTML(name.value.trim());
                        const successMessage = document.createElement('div');
                        successMessage.className = 'success-message';
                        successMessage.style.cssText = 'text-align: center; padding: 2rem 1rem; animation: fadeIn 0.5s ease;';
                        successMessage.innerHTML = `
                            <i class="fas fa-check-circle" style="color: #4CAF50; font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                            <h3 style="color: #1e1e2a; margin-bottom: 0.5rem;">Thank you, ${safeName}!</h3>
                            <p style="color: #4a4e6b;">Your message has been sent successfully. I'll get back to you within 24 hours.</p>
                            <button type="button" data-reload style="margin-top: 1.5rem; padding: 0.75rem 2rem; background: #4a6cf7; color: white; border: none; border-radius: 50px; cursor: pointer; font-weight: 600; font-family: inherit;">
                                <i class="fas fa-plus"></i> Send Another Message
                            </button>
                        `;
                        successMessage.querySelector('[data-reload]').addEventListener('click', () => location.reload());
                        contactForm.style.display = 'none';
                        formCard.insertBefore(successMessage, contactForm);
                    })
                    .catch(() => {
                        alert('Something went wrong. Please try again.');
                        submitButton.disabled = false;
                        submitButton.innerHTML = originalText;
                    });
                    
                } else {
                    alert('Please fix the following errors:\n\n• ' + errorMessages.join('\n• '));
                }
            });
            
            // Clear error styles on input
            contactForm.querySelectorAll('input, textarea').forEach(field => {
                field.addEventListener('input', function() {
                    this.style.borderColor = '';
                    this.style.boxShadow = '';
                    const error = this.parentElement.querySelector('.form-error');
                    if (error) {
                        error.remove();
                    }
                });
            });
        }
    }
    
    // Helper function to show field error
    function showFieldError(field, message) {
        const error = document.createElement('span');
        error.className = 'form-error';
        error.style.cssText = `
            display: block;
            color: #e2555c;
            font-size: 0.75rem;
            margin-top: 0.25rem;
            font-weight: 500;
        `;
        error.textContent = '⚠ ' + message;
        field.parentElement.appendChild(error);
    }

    // Helper: escape user input before injecting into innerHTML (XSS guard)
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /* ============================================
       SECTION 15: HELPER FUNCTIONS
       ============================================ */

    // Handle touch events (mobile)
    function handleTouchStart(e) {
        // Do something on touch
    }

    // Enable parallax (desktop)
    function enableParallax() {
        const parallaxElements = document.querySelectorAll('[data-parallax]');
        if (parallaxElements.length === 0) return;

        const parallaxScroll = throttle(() => {
            const scrolled = window.pageYOffset;
            parallaxElements.forEach(el => {
                const speed = parseFloat(el.dataset.parallax) || 0.5;
                el.style.transform = `translateY(${scrolled * speed}px)`;
            });
        }, 16);

        window.addEventListener('scroll', parallaxScroll, { passive: true });
    }

    // Enable hover effects (desktop)
    function enableHoverEffects() {
        document.querySelectorAll('.hover-effect').forEach(el => {
            el.addEventListener('mouseenter', function() {
                this.classList.add('hovered');
            });
            el.addEventListener('mouseleave', function() {
                this.classList.remove('hovered');
            });
        });
    }

    // Check if element is in viewport
    function isElementInViewport(el) {
        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // Get all device info as object
    function getDeviceInfo() {
        return {
            device: detectDevice(),
            os: detectOSPreferences(),
            screen: detectScreenProperties(),
            network: detectNetwork(),
            features: detectFeatures(),
            userAgent: navigator.userAgent,
            language: navigator.language,
            cookiesEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack || 'not set'
        };
    }

    /* ============================================
       SECTION 16: INITIALIZATION - RUN EVERYTHING
       ============================================ */

    console.log('🚀 Portfolio Website initialized');
    console.log('📊 Device Info:', getDeviceInfo());

    // Initialize all features
    initThemeToggle();
    initMobileNav();
    setActiveNavLink();
    initSmoothScroll();
    initPostLoginTour();
    initScrollAnimations();
    initBackToTop();
    initFooterTop();
    initScrollProgress();
    initWorkFilters();
    initWorkHoverEffects();
    initSkillTags();
    initContactForm();
    deviceSpecificActions();
    lazyLoadImages();

    // Update scroll indicators
    window.addEventListener('scroll', updateScrollIndicators);

    // Load non-critical CSS after page load
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            lazyLoadCSS('non-critical.css');
        });
    } else {
        setTimeout(() => {
            lazyLoadCSS('non-critical.css');
        }, 3000);
    }

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Listen to network changes
    if ('connection' in navigator) {
        navigator.connection.addEventListener('change', function() {
            const network = detectNetwork();
            console.log('📶 Network changed:', network.effectiveType);
            if (network.isSlow) {
                document.body.classList.add('slow-connection');
                loadLowResImages();
            } else {
                document.body.classList.remove('slow-connection');
            }
        });
    }

    // Listen to OS preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        console.log('🌓 Color scheme changed to:', e.matches ? 'dark' : 'light');
    });

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function(e) {
        if (e.matches) {
            document.body.classList.add('reduce-motion');
        } else {
            document.body.classList.remove('reduce-motion');
        }
    });

    console.log('%c💻 Portfolio Website Ready!', 'font-size: 16px; font-weight: bold; color: #4a6cf7;');
    console.log('%c📧 Contact: belachew@portfolio.dev', 'font-size: 14px; color: #4a4e6b;');

    window.__portfolio = {
        detectDevice,
        detectOSPreferences,
        detectScreenProperties,
        detectNetwork,
        detectFeatures,
        getDeviceInfo,
        lazyLoadScript,
        lazyLoadCSS,
        isElementInViewport
    };

});

// Window Load - Everything fully loaded
window.addEventListener('load', function() {
    console.log('✅ All resources loaded successfully!');
    
    // Prefetch next page or resources
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            // Prefetch heavy resources if needed
            // lazyLoadScript('heavy-library.js');
        });
    }
});

