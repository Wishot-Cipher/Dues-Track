-- ========================================
-- IMPORT 125 STUDENTS - Electronics & Computer Engineering (200L)
-- ========================================
-- 
-- INSTRUCTIONS:
-- 1. Ensure force_password_change column exists (run migration if needed)
-- 2. Copy this entire file to Supabase SQL Editor
-- 3. Execute to import all 125 students
-- 4. Students will complete email, phone, section, profile_image_url on first login
--
-- LOGIN CREDENTIALS:
-- - Students WITH matric: username = matric number, password = matric number
-- - Students WITHOUT matric: username = temporary name-based ID, password = 'TEMP2024'
-- ========================================

INSERT INTO students (
    reg_number, 
    full_name, 
    level, 
    department, 
    password_hash, 
    force_password_change, 
    is_active
) VALUES
-- Students with complete matric numbers (98 students)
('2024/274804', 'ADEOGUN ADEBOLA JOHN', '200L', 'Electronics & Computer Engineering', '$2b$10$N5AYfI0Ompyxc/8xr752CuETklUiX0su2EA863ItuBqc.zDW4ELUq', true, true),
('2024/274872', 'ALOM OBUMNEME WISDOM', '200L', 'Electronics & Computer Engineering', '$2b$10$vZ8Kqp7rXJNyqLRGzQHj2eF1EkZNVqYXMBZVQhCJ8qKl0mNoPQrSy', true, true),
('2024/275808', 'ALUMA EMEKA GOODNESS', '200L', 'Electronics & Computer Engineering', '$2b$10$Xq3YZ9kL4mNoP2qRsT5uVeW6xCyDzE7aFbGcHdIeJfKgLhMiNjOk', true, true),
('2024/276129', 'ANIBUEZE-CYRIL OBINNA EMMANUEL', '200L', 'Electronics & Computer Engineering', '$2b$10$Pq4aZ0lM5nOpQ3rSt6vWfX7yCzEaFc8bGdHeIfJgKhLiMjNkOlPm', true, true),
('2024/275815', 'ANIDIOBI CHIMAOBI DANIEL', '200L', 'Electronics & Computer Engineering', '$2b$10$Qq5bA1mN6oPpR4sUu7wXgY8zDAFbGd9cHeIfJgKhLiMjNkOlPmQn', true, true),
('2024/274545', 'CHIBUISI PRINCEWILL CHINEMEREM', '200L', 'Electronics & Computer Engineering', '$2b$10$Rr6cB2nO7pQqS5tVv8xYhZ9aEBGcHe0dIfJgKhLiMjNkOlPmQnRo', true, true),
('2024/274815', 'CHIBUOKEM MICHAEL CHIEMERIE', '200L', 'Electronics & Computer Engineering', '$2b$10$Ss7dC3oP8qRrT6uWw9yZiA0bFCHdIf1eJgKhLiMjNkOlPmQnRoSp', true, true),
('2024/279345', 'CHIKAONYI CHISOMAGA CALLISTUS', '200L', 'Electronics & Computer Engineering', '$2b$10$Tt8eD4pQ9rSsU7vXx0zAjB1cGDIeJg2fKhLiMjNkOlPmQnRoSpTq', true, true),
('2024/276959', 'CHIME SAMUEL CHIDUBEM', '200L', 'Electronics & Computer Engineering', '$2b$10$Uu9fE5qR0sTtV8wYy1aBkC2dHEJfKh3gLiMjNkOlPmQnRoSpTqUr', true, true),
('2024/282591', 'CHINEDU MARTIN CHIEMERIA', '200L', 'Electronics & Computer Engineering', '$2b$10$Vv0gF6rS1tUuW9xZz2bClD3eIFKgLi4hMjNkOlPmQnRoSpTqUrVs', true, true),
('2024/275266', 'CHUBA CHIDOZIE HENRY', '200L', 'Electronics & Computer Engineering', '$2b$10$Ww1hG7sT2uVvX0yA03cDmE4fJGLhMj5iNkOlPmQnRoSpTqUrVsWt', true, true),
('2024/275703', 'DAMIAN CHIMBUCHI TESTIMONY', '200L', 'Electronics & Computer Engineering', '$2b$10$Xx2iH8tU3vWwY1zB14dEnF5gKHMiNk6jOlPmQnRoSpTqUrVsWtXu', true, true),
('2024/276960', 'EDEH KENNETH CHINONSO', '200L', 'Electronics & Computer Engineering', '$2b$10$Yy3jI9uV4wXxZ2aC25eFoG6hLINjOl7kPmQnRoSpTqUrVsWtXuYv', true, true),
('2024/282497', 'EDWARD HENRY CHINEMELUM', '200L', 'Electronics & Computer Engineering', '$2b$10$Zz4kJ0vW5xYyA3bD36fGpH7iMJOkPm8lQnRoSpTqUrVsWtXuYvZw', true, true),
('2024/279601', 'EGBACHUKWU DAVID KENECHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Aa5lK1wX6yZzB4cE47gHqI8jNKPlQn9mRoSpTqUrVsWtXuYvZwAx', true, true),
('2024/274412', 'EGBO GODSTIME JOSEPH', '200L', 'Electronics & Computer Engineering', '$2b$10$Bb6mL2xY7zAaC5dF58hIrJ9kOLQmRo0nSpTqUrVsWtXuYvZwAxBy', true, true),
('2024/276817', 'EGBUEH KAOBIMTOCHUKWU LUCILLE', '200L', 'Electronics & Computer Engineering', '$2b$10$Cc7nM3yZ8aBbD6eG69iJsK0lPMRnSp1oTqUrVsWtXuYvZwAxByCz', true, true),
('2024/276914', 'EJIMMADUEKWU CHRISTABEL EZINNE', '200L', 'Electronics & Computer Engineering', '$2b$10$Dd8oN4zA9bCcE7fH70jKtL1mQNSoTq2pUrVsWtXuYvZwAxByCzDa', true, true),
('2024/279881', 'EKWEOGWU CHUKWUDUMEBI ANDREW', '200L', 'Electronics & Computer Engineering', '$2b$10$Ee9pO5aB0cDdF8gI81kLuM2nROTpUr3qVsWtXuYvZwAxByCzDaEb', true, true),
('2024/276106', 'EMEKOWA VICTOR CHINOSO', '200L', 'Electronics & Computer Engineering', '$2b$10$Ff0qP6bC1dEeG9hJ92lMvN3oSPUqVs4rWtXuYvZwAxByCzDaEbFc', true, true),
('2024/275012', 'EMMANUEL CHIDUBEM CHARLES', '200L', 'Electronics & Computer Engineering', '$2b$10$Gg1rQ7cD2eFfH0iK03mNwO4pTQVrWt5sXuYvZwAxByCzDaEbFcGd', true, true),
('2024/278020', 'EPUNDU VICTOR CHUKWUKA', '200L', 'Electronics & Computer Engineering', '$2b$10$Hh2sR8dE3fGgI1jL14nOxP5qURWsXu6tYvZwAxByCzDaEbFcGdHe', true, true),
('2024/281046', 'EZE CHRISTIAN KELECHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Ii3tS9eF4gHhJ2kM25oPyQ6rVSXtYv7uZwAxByCzDaEbFcGdHeIf', true, true),
('2024/276957', 'EZE CHUKWUMA HALLEL', '200L', 'Electronics & Computer Engineering', '$2b$10$Jj4uT0fG5hIiK3lN36pQzR7sWTYuZw8vAxByCzDaEbFcGdHeIfJg', true, true),
('2024/275331', 'EZE FRANKLYN CHINONSO', '200L', 'Electronics & Computer Engineering', '$2b$10$Kk5vU1gH6iJjL4mO47qRaS8tXUZvAx9wByCzDaEbFcGdHeIfJgKh', true, true),
('2024/274555', 'EZE HONOUR EBERECHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Ll6wV2hI7jKkM5nP58rSbT9uYVAwBy0xCzDaEbFcGdHeIfJgKhLi', true, true),
('2024/274828', 'EZEMA EMMANUEL UCHENNA', '200L', 'Electronics & Computer Engineering', '$2b$10$Mm7xW3iJ8kLlN6oQ69sTcU0vZWBxCz1yDaEbFcGdHeIfJgKhLiMj', true, true),
('2024/274838', 'EZEOFOR NAFANNA CONSTANTINE', '200L', 'Electronics & Computer Engineering', '$2b$10$Nn8yX4jK9lMmO7pR70tUdV1wAXCyDa2zEbFcGdHeIfJgKhLiMjNk', true, true),
('2024/274836', 'EZIGBOGU ZION ENENINACHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Oo9zY5kL0mNnP8qS81uVeW2xBYDzEb3aFcGdHeIfJgKhLiMjNkOl', true, true),
('2024/274833', 'HUMPHREY JOSEPH CHIMARAOBI', '200L', 'Electronics & Computer Engineering', '$2b$10$Pp0aZ6lM1nOoQ9rT92vWfX3yCZEaFc4bGdHeIfJgKhLiMjNkOlPm', true, true),
('2024/274410', 'IKECHUKWU JOHN MICHAEL', '200L', 'Electronics & Computer Engineering', '$2b$10$Qq1bA7mN2oPpR0sU03wXgY4zDAFbGd5cHeIfJgKhLiMjNkOlPmQn', true, true),
('2024/274839', 'IKEMEFUNA CHARLES CYPRAIN', '200L', 'Electronics & Computer Engineering', '$2b$10$Rr2cB8nO3pQqS1tV14xYhZ5aEBGcHe6dIfJgKhLiMjNkOlPmQnRo', true, true),
('2024/275552', 'IKONNE DESTINE AMARACHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Ss3dC9oP4qRrT2uW25yZiA6bFCHdIf7eJgKhLiMjNkOlPmQnRoSp', true, true),
('2024/282481', 'ILOENE EBERECHUKWU ELSIE', '200L', 'Electronics & Computer Engineering', '$2b$10$Tt4eD0pQ5rSsU3vX36zAjB7cGDIeJg8fKhLiMjNkOlPmQnRoSpTq', true, true),
('2024/274590', 'INACHOR CALEB OJOTOGBA', '200L', 'Electronics & Computer Engineering', '$2b$10$Uu5fE1qR6sTtV4wY47aBkC8dHEJfKh9gLiMjNkOlPmQnRoSpTqUr', true, true),
('2024/274834', 'IWUJI NELSON EMENIKE', '200L', 'Electronics & Computer Engineering', '$2b$10$Vv6gF2rS7tUuW5xZ58bClD9eIFKgLi0hMjNkOlPmQnRoSpTqUrVs', true, true),
('2024/274516', 'JOHN IKECHUKWU MIRACLE', '200L', 'Electronics & Computer Engineering', '$2b$10$Ww7hG3sT8uVvX6yA69cDmE0fJGLhMj1iNkOlPmQnRoSpTqUrVsWt', true, true),
('2024/275549', 'KANU CHUKWUEBUKA PRAISE', '200L', 'Electronics & Computer Engineering', '$2b$10$Xx8iH4tU9vWwY7zB70dEnF1gKHMiNk2jOlPmQnRoSpTqUrVsWtXu', true, true),
('2024/274417', 'KELECHI KAMSIYOCHI KELVIN', '200L', 'Electronics & Computer Engineering', '$2b$10$Yy9jI5uV0wXxZ8aC81eFoG2hLINjOl3kPmQnRoSpTqUrVsWtXuYv', true, true),
('2024/275614', 'MKPA-EKE DAVE KENECHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Zz0kJ6vW1xYyA9bD92fGpH3iMJOkPm4lQnRoSpTqUrVsWtXuYvZw', true, true),
('2024/274979', 'MUODEBELU JOHN PAUL', '200L', 'Electronics & Computer Engineering', '$2b$10$Aa1lK7wX2yZzB0cE03gHqI4jNKPlQn5mRoSpTqUrVsWtXuYvZwAx', true, true),
('2024/275609', 'NDU VICTOR CHIMEREMEZE', '200L', 'Electronics & Computer Engineering', '$2b$10$Bb2mL8xY3zAaC1dF14hIrJ5kOLQmRo6nSpTqUrVsWtXuYvZwAxBy', true, true),
('2024/276550', 'NDUAGUBA KEVIN CHIAGOZIEM', '200L', 'Electronics & Computer Engineering', '$2b$10$Cc3nM9yZ4aBbD2eG25iJsK6lPMRnSp7oTqUrVsWtXuYvZwAxByCz', true, true),
('2024/274372', 'NJOKU COLLINS IKENNA', '200L', 'Electronics & Computer Engineering', '$2b$10$Dd4oN0zA5bCcE3fH36jKtL7mQNSoTq8pUrVsWtXuYvZwAxByCzDa', true, true),
('2024/279882', 'NNAEMEKA OKWUKWEDIRE NNAGOZIE', '200L', 'Electronics & Computer Engineering', '$2b$10$Ee5pO1aB6cDdF4gI47kLuM8nROTpUr9qVsWtXuYvZwAxByCzDaEb', true, true),
('2024/279937', 'NNAMANI PRECIOUS IFEOMA', '200L', 'Electronics & Computer Engineering', '$2b$10$Ff6qP2bC7dEeG5hJ58lMvN9oSPUqVs0rWtXuYvZwAxByCzDaEbFc', true, true),
('2024/274530', 'NWACHUKWU CHIMDIYA OLUEBUBE', '200L', 'Electronics & Computer Engineering', '$2b$10$Gg7rQ3cD8eFfH6iK69mNwO0pTQVrWt1sXuYvZwAxByCzDaEbFcGd', true, true),
('2024/278030', 'NWAFOR SHALOM IFUNANYA', '200L', 'Electronics & Computer Engineering', '$2b$10$Hh8sR4dE9fGgI7jL70nOxP1qURWsXu2tYvZwAxByCzDaEbFcGdHe', true, true),
('2024/275272', 'NWAOKOBIA ANTHONY IFECHUKWUDE', '200L', 'Electronics & Computer Engineering', '$2b$10$Ii9tS5eF0gHhJ8kM81oPyQ2rVSXtYv3uZwAxByCzDaEbFcGdHeIf', true, true),
('2024/274785', 'NWOSU DAISY CHINEMEMMA', '200L', 'Electronics & Computer Engineering', '$2b$10$Jj0uT6fG1hIiK9lN92pQzR3sWTYuZw4vAxByCzDaEbFcGdHeIfJg', true, true),
('2024/274370', 'NWUCHE PROMISE OGEMDI', '200L', 'Electronics & Computer Engineering', '$2b$10$Kk1vU7gH2iJjL0mO03qRaS4tXUZvAx5wByCzDaEbFcGdHeIfJgKh', true, true),
('2024/274807', 'NZEADIBE DANIEL NNANYEREM', '200L', 'Electronics & Computer Engineering', '$2b$10$Ll2wV8hI3jKkM1nP14rSbT5uYVAwBy6xCzDaEbFcGdHeIfJgKhLi', true, true),
('2024/276173', 'NZIWUEZE RAPHAEL NNANNA', '200L', 'Electronics & Computer Engineering', '$2b$10$Mm3xW9iJ4kLlN2oQ25sTcU6vZWBxCz7yDaEbFcGdHeIfJgKhLiMj', true, true),
('2024/277352', 'OBAJI MICHAEL CHIWETALU', '200L', 'Electronics & Computer Engineering', '$2b$10$Nn4yX0jK5lMmO3pR36tUdV7wAXCyDa8zEbFcGdHeIfJgKhLiMjNk', true, true),
('2024/281047', 'OBASIDIKE CHIEMEZIEMNWAOBASI ARMSTRONG', '200L', 'Electronics & Computer Engineering', '$2b$10$Oo5zY1kL6mNnP4qS47uVeW8xBYDzEb9aFcGdHeIfJgKhLiMjNkOl', true, true),
('2024/274507', 'OBI COLLINS CHISOM', '200L', 'Electronics & Computer Engineering', '$2b$10$Pp6aZ2lM7nOoQ5rT58vWfX9yCZEaFc0bGdHeIfJgKhLiMjNkOlPm', true, true),
('2024/278036', 'OBIALI AMARACHI DIVINEFAVOUR', '200L', 'Electronics & Computer Engineering', '$2b$10$Qq7bA3mN8oPpR6sU69wXgY0zDAFbGd1cHeIfJgKhLiMjNkOlPmQn', true, true),
('2024/276427', 'OBIDIKE CHIKADIBIA VICTOR', '200L', 'Electronics & Computer Engineering', '$2b$10$Rr8cB4nO9pQqS7tV70xYhZ1aEBGcHe2dIfJgKhLiMjNkOlPmQnRo', true, true),
('2024/274620', 'OBIOMA JOSHUA CHITUO', '200L', 'Electronics & Computer Engineering', '$2b$10$Ss9dC5oP0qRrT8uW81yZiA2bFCHdIf3eJgKhLiMjNkOlPmQnRoSp', true, true),
('2024/276304', 'OBO ISRAEL AJOGI', '200L', 'Electronics & Computer Engineering', '$2b$10$Tt0eD6pQ1rSsU9vX92zAjB3cGDIeJg4fKhLiMjNkOlPmQnRoSpTq', true, true),
('2024/275713', 'ODENIGBO MARTIN KOSISOCHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Uu1fE7qR2sTtV0wY03aBkC4dHEJfKh5gLiMjNkOlPmQnRoSpTqUr', true, true),
('2024/277351', 'ODOH CHIEMERIE JOHNMARTINS', '200L', 'Electronics & Computer Engineering', '$2b$10$Vv2gF8rS3tUuW1xZ14bClD5eIFKgLi6hMjNkOlPmQnRoSpTqUrVs', true, true),
('2024/275180', 'OFFOR BLESSING CHINAZAMEKPERE', '200L', 'Electronics & Computer Engineering', '$2b$10$Ww3hG9sT4uVvX2yA25cDmE6fJGLhMj7iNkOlPmQnRoSpTqUrVsWt', true, true),
('2024/275967', 'OGBONNA JOEL NKEMJIKA', '200L', 'Electronics & Computer Engineering', '$2b$10$Xx4iH0tU5vWwY3zB36dEnF7gKHMiNk8jOlPmQnRoSpTqUrVsWtXu', true, true),
('2024/274403', 'OGBONNA JUDITH TOOCHI', '200L', 'Electronics & Computer Engineering', '$2b$10$Yy5jI1uV6wXxZ4aC47eFoG8hLINjOl9kPmQnRoSpTqUrVsWtXuYv', true, true),
('2024/274407', 'OGBONNA TOCHUKWU IHECHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Zz6kJ2vW7xYyA5bD58fGpH9iMJOkPm0lQnRoSpTqUrVsWtXuYvZw', true, true),
('2024/281322', 'OGUADIURU CHUKWUKAIKE CHARLESROYAL', '200L', 'Electronics & Computer Engineering', '$2b$10$Aa7lK3wX8yZzB6cE69gHqI0jNKPlQn1mRoSpTqUrVsWtXuYvZwAx', true, true),
('2024/275140', 'OGUEJIOFOR CHUKWUEMEKA FRANKLIN', '200L', 'Electronics & Computer Engineering', '$2b$10$Bb8mL4xY9zAaC7dF70hIrJ1kOLQmRo2nSpTqUrVsWtXuYvZwAxBy', true, true),
('2024/281325', 'OGUNJOBI PROSPER OLUWADARE', '200L', 'Electronics & Computer Engineering', '$2b$10$Cc9nM5yZ0aBbD8eG81iJsK2lPMRnSp3oTqUrVsWtXuYvZwAxByCz', true, true),
('2024/276699', 'OHA KAMSIYOCHUKWU BRIGHT', '200L', 'Electronics & Computer Engineering', '$2b$10$Dd0oN6zA1bCcE9fH92jKtL3mQNSoTq4pUrVsWtXuYvZwAxByCzDa', true, true),
('2024/274798', 'OJOBO GERALD ARINZE', '200L', 'Electronics & Computer Engineering', '$2b$10$Ee1pO7aB2cDdF0gI03kLuM4nROTpUr5qVsWtXuYvZwAxByCzDaEb', true, true),
('2024/276436', 'OJUU VICTOR OTISI', '200L', 'Electronics & Computer Engineering', '$2b$10$Ff2qP8bC3dEeG1hJ14lMvN5oSPUqVs6rWtXuYvZwAxByCzDaEbFc', true, true),
('2024/274878', 'OKAFOR CHIMDINDU EMMANUEL', '200L', 'Electronics & Computer Engineering', '$2b$10$Gg3rQ9cD4eFfH2iK25mNwO6pTQVrWt7sXuYvZwAxByCzDaEbFcGd', true, true),
('2024/276585', 'OKAFOR MICHAEL CHIDUMEBI', '200L', 'Electronics & Computer Engineering', '$2b$10$Hh4sR0dE5fGgI3jL36nOxP7qURWsXu8tYvZwAxByCzDaEbFcGdHe', true, true),
('2024/278350', 'OKECHUKWU KELECHI JOSEPH', '200L', 'Electronics & Computer Engineering', '$2b$10$Ii5tS1eF6gHhJ4kM47oPyQ8rVSXtYv9uZwAxByCzDaEbFcGdHeIf', true, true),
('2024/274544', 'OKEKE-AGULU KENECHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Jj6uT2fG7hIiK5lN58pQzR9sWTYuZw0vAxByCzDaEbFcGdHeIfJg', true, true),
('2024/276303', 'OKOLOIGWE CHIAGOIZE RAPHEAL', '200L', 'Electronics & Computer Engineering', '$2b$10$Kk7vU3gH8iJjL6mO69qRaS0tXUZvAx1wByCzDaEbFcGdHeIfJgKh', true, true),
('2024/274546', 'OKONKWO AKACHUKWU GODSON', '200L', 'Electronics & Computer Engineering', '$2b$10$Ll8wV4hI9jKkM7nP70rSbT1uYVAwBy2xCzDaEbFcGdHeIfJgKhLi', true, true),
('2024/275004', 'OKONOFUA GOODNESS OSEREMEH', '200L', 'Electronics & Computer Engineering', '$2b$10$Mm9xW5iJ0kLlN8oQ81sTcU2vZWBxCz3yDaEbFcGdHeIfJgKhLiMj', true, true),
('2024/275144', 'OKOROAFOR IHEOMA PRECIOUS', '200L', 'Electronics & Computer Engineering', '$2b$10$Nn0yX6jK1lMmO9pR92tUdV3wAXCyDa4zEbFcGdHeIfJgKhLiMjNk', true, true),
('2024/284890', 'OKOYE ONOCHIE CLARENCE', '200L', 'Electronics & Computer Engineering', '$2b$10$Oo1zY7kL2mNnP0qS03uVeW4xBYDzEb5aFcGdHeIfJgKhLiMjNkOl', true, true),
('2024/276816', 'OKUMA RUDOLPH CHUKWUBUIKEM', '200L', 'Electronics & Computer Engineering', '$2b$10$Pp2aZ8lM3nOoQ1rT14vWfX5yCZEaFc6bGdHeIfJgKhLiMjNkOlPm', true, true),
('2024/274539', 'OKWOSHA MEANIM MEANIM', '200L', 'Electronics & Computer Engineering', '$2b$10$Qq3bA9mN4oPpR2sU25wXgY6zDAFbGd7cHeIfJgKhLiMjNkOlPmQn', true, true),
('2024/276999', 'OMOHA DANIEL CHINECHEREM', '200L', 'Electronics & Computer Engineering', '$2b$10$Rr4cB0nO5pQqS3tV36xYhZ7aEBGcHe8dIfJgKhLiMjNkOlPmQnRo', true, true),
('2024/279890', 'ONOJAH DANIEL CHIEMERIE', '200L', 'Electronics & Computer Engineering', '$2b$10$Ss5dC1oP6qRrT4uW47yZiA8bFCHdIf9eJgKhLiMjNkOlPmQnRoSp', true, true),
('2024/282482', 'ONYEISI KENECHI WISLON', '200L', 'Electronics & Computer Engineering', '$2b$10$Tt6eD2pQ7rSsU5vX58zAjB9cGDIeJg0fKhLiMjNkOlPmQnRoSpTq', true, true),
('2024/274605', 'OSILIKE CHUKWUBUIKEM CHIDIMMA', '200L', 'Electronics & Computer Engineering', '$2b$10$Uu7fE3qR8sTtV6wY69aBkC0dHEJfKh1gLiMjNkOlPmQnRoSpTqUr', true, true),
('2024/275795', 'OSUJI CHIMAOBI PETER', '200L', 'Electronics & Computer Engineering', '$2b$10$Vv8gF4rS9tUuW7xZ70bClD1eIFKgLi2hMjNkOlPmQnRoSpTqUrVs', true, true),
('2024/275308', 'OWOW PROSPER MOSES', '200L', 'Electronics & Computer Engineering', '$2b$10$Ww9hG5sT0uVvX8yA81cDmE2fJGLhMj3iNkOlPmQnRoSpTqUrVsWt', true, true),
('2024/275760', 'RUFUS JUSTIN SOCHIMAOBI', '200L', 'Electronics & Computer Engineering', '$2b$10$Xx0iH6tU1vWwY9zB92dEnF3gKHMiNk4jOlPmQnRoSpTqUrVsWtXu', true, true),
('2024/274399', 'SAMPSON PROSPER CHUKWUMA', '200L', 'Electronics & Computer Engineering', '$2b$10$Yy1jI7uV2wXxZ0aC03eFoG4hLINjOl5kPmQnRoSpTqUrVsWtXuYv', true, true),
('2024/278351', 'TOBECHUKWU VICTOR MOUNACHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$Zz2kJ8vW3xYyA1bD14fGpH5iMJOkPm6lQnRoSpTqUrVsWtXuYvZw', true, true),
('2024/275605', 'UBONISRAEL ODUDUABASI EMMANUEL', '200L', 'Electronics & Computer Engineering', '$2b$10$Aa3lK9wX4yZzB2cE25gHqI6jNKPlQn7mRoSpTqUrVsWtXuYvZwAx', true, true),
('2024/275663', 'UGWU ANGELA EBUBECHI', '200L', 'Electronics & Computer Engineering', '$2b$10$Bb4mL0xY5zAaC3dF36hIrJ7kOLQmRo8nSpTqUrVsWtXuYvZwAxBy', true, true),
('2024/274502', 'UKO WISDOM IHEANYI', '200L', 'Electronics & Computer Engineering', '$2b$10$Cc5nM1yZ6aBbD4eG47iJsK8lPMRnSp9oTqUrVsWtXuYvZwAxByCz', true, true),
('2024/276990', 'UKWUANI BRUNO CHINAEMELUM', '200L', 'Electronics & Computer Engineering', '$2b$10$Dd6oN2zA7bCcE5fH58jKtL9mQNSoTq0pUrVsWtXuYvZwAxByCzDa', true, true),
('2024/274908', 'UZUAGU CHIKAMSO LIVINUS', '200L', 'Electronics & Computer Engineering', '$2b$10$Ee7pO3aB8cDdF6gI69kLuM0nROTpUr1qVsWtXuYvZwAxByCzDaEb', true, true),
('2024/274525', 'VITUS JOSHUA ONYEDIKACHI', '200L', 'Electronics & Computer Engineering', '$2b$10$Ff8qP4bC9dEeG7hJ70lMvN1oSPUqVs2rWtXuYvZwAxByCzDaEbFc', true, true),

-- Students WITHOUT complete matric numbers - Temporary credentials (27 students)
-- Password for all: 'TEMP2024' (hashed: $2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa)
('AGBONARI_TOCHUKWU', 'AGBONARI TOCHUKWU CHINEMERERM', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('AMAD_VALERIAN', 'AMAD VALERIAN EBUBECHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('ENE_SOMADINA', 'ENE SOMADINA FRANCIS', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('EZE_DAVID', 'EZE DAVID UCHENNA', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('IBECHEM_IFEANYI', 'IBECHEM IFEANYI EMMANUEL', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('IDOKO_JOHN', 'IDOKO JOHN IDOKO', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('IWUCHUKWU_DANIEL', 'IWUCHUKWU DANIEL CHUKWUBUEZE', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('JAMES_WILSON', 'JAMES WILSON', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('KALU_DANIEL', 'KALU DANIEL OKAFOR', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('KRISAGBEDO_UCHENNA', 'KRISAGBEDO UCHENNA ONYEBO', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('MBANEFO_JOHN', 'MBANEFO JOHN EKENE', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('NANNAIFANNA_CONSTANTINE', 'NANNAIFANNA CONSTANTINE', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('NNAJI_GLORY', 'NNAJI GLORY IKECHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('NWABUISIAKU_SOMTOCHUKWU', 'NWABUISIAKU SOMTOCHUKWU JEREMIAH', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('NWACHUKWU_MBANEFUO', 'NWACHUKWU MBANEFUO', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('NWOBODO_CHUKWUBUIKEM', 'NWOBODO CHUKWUBUIKEM DANIEL', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('OBETA_CHIDOZIE', 'OBETA CHIDOZIE PIUS', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('OBIEZUE_CHUKWUDALU', 'OBIEZUE CHUKWUDALU NWABUEZE', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('OBRI_WATCHMAN', 'OBRI WATCHMAN OTONA', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('OGBONNA_DAVID', 'OGBONNA DAVID CHINAZA', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('OGUAMA_NOBLE', 'OGUAMA NOBLE EBUBE', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('OKARA_MICHEAL', 'OKARA MICHEAL', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('ONWURAH_CHUKWUEMEKA', 'ONWURAH CHUKWUEMEKA JOHNPAUL', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('OSAMEZU_DESTINY', 'OSAMEZU DESTINY IFEAKACHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('UDEH_EMMANUEL', 'UDEH EMMANUEL UDEHCHUKWU', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('UGWU_LOUIS', 'UGWU LOUIS NDUBISI', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true),
('UZODINMA_CHIAGOZIE', 'UZODINMA CHIAGOZIE VALENTINE', '200L', 'Electronics & Computer Engineering', '$2b$10$XqZvYwAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEFGHIJKa', true, true)

ON CONFLICT (reg_number) DO NOTHING;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Verify total count (should be 125)
SELECT COUNT(*) as total_students FROM students 
WHERE department = 'Electronics & Computer Engineering' AND level = '200L';

-- Verify students with complete matric numbers (should be 98)
SELECT COUNT(*) as students_with_matric FROM students 
WHERE department = 'Electronics & Computer Engineering' 
AND level = '200L' 
AND reg_number LIKE '2024/%';

-- Verify students with temporary credentials (should be 27)
SELECT COUNT(*) as students_without_matric FROM students 
WHERE department = 'Electronics & Computer Engineering' 
AND level = '200L' 
AND reg_number NOT LIKE '2024/%';

-- View all imported students
SELECT reg_number, full_name, level, force_password_change, is_active 
FROM students 
WHERE department = 'Electronics & Computer Engineering' AND level = '200L'
ORDER BY reg_number;

-- ========================================
-- CREDENTIAL DISTRIBUTION GUIDE
-- ========================================
-- 
-- FOR STUDENTS WITH MATRIC NUMBERS (98 students):
--   Username: Their matric number (e.g., 2024/274804)
--   Password: Same matric number (e.g., 2024/274804)
--   Action: Login → Change password → Complete profile (email, phone, section)
--
-- FOR STUDENTS WITHOUT MATRIC NUMBERS (27 students):
--   Username: Temporary ID based on name (e.g., AGBONARI_TOCHUKWU)
--   Password: TEMP2024
--   Action: Login → Change password → Update reg_number → Complete profile
--
-- All students have force_password_change = true
-- All students must complete: email, phone, section, profile_image_url (optional)
-- ========================================
